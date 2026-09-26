import AuthenticationServices
import Foundation
import NitroModules
import UIKit

/// WebAuthn passkeys on top of AuthenticationServices' platform provider.
///
/// `active` is only read or written under `lock`. That is what makes the `@unchecked Sendable`
/// sound: JS calls arrive on the JS thread, settlement happens on the main thread.
final class HybridNitroPasskeys: HybridNitroPasskeysSpec, @unchecked Sendable {
  private let lock = NSLock()
  /// The in-flight request. Also the strong reference that keeps the helper alive, because
  /// `ASAuthorizationController` only holds its delegate weakly.
  private var active: PasskeyRequest?

  var isSupported: Bool { true }

  func create(creationOptionsJson: String) throws -> Promise<String> {
    begin { .registration(try RegistrationParameters(json: creationOptionsJson)) }
  }

  func get(requestOptionsJson: String) throws -> Promise<String> {
    begin { .assertion(try AssertionParameters(json: requestOptionsJson)) }
  }

  private func begin(_ parse: () throws -> PasskeyCeremony) -> Promise<String> {
    lock.lock()
    defer { lock.unlock() }

    guard active == nil else {
      return .rejected(withError: passkeyError("unknown", "A passkey request is already in progress"))
    }

    let ceremony: PasskeyCeremony
    do {
      ceremony = try parse()
    } catch {
      return .rejected(withError: error)
    }

    let promise = Promise<String>()
    let request = PasskeyRequest(ceremony: ceremony, promise: promise) { [weak self] settled in
      self?.clear(settled)
    }
    active = request
    DispatchQueue.main.async {
      request.start()
    }
    return promise
  }

  /// Called exactly once per request, by `PasskeyRequest.settle`, before the promise settles so a
  /// follow-up call made from the JS continuation is not rejected as "in progress".
  private func clear(_ request: PasskeyRequest) {
    lock.lock()
    defer { lock.unlock() }
    if active === request {
      active = nil
    }
  }
}

// MARK: - Request helper

enum PasskeyCeremony: Sendable {
  case registration(RegistrationParameters)
  case assertion(AssertionParameters)
}

private func passkeyError(_ token: String, _ text: String) -> Error {
  RuntimeError.error(withMessage: PasskeyErrorToken.message(token: token, text))
}

/// One `create` or `get` ceremony. Lives on the main actor (both AuthenticationServices
/// protocols are UI-actor isolated); only `init` runs on the calling JS thread.
@MainActor
private final class PasskeyRequest: NSObject {
  private let ceremony: PasskeyCeremony
  private let promise: Promise<String>
  private let onSettle: @Sendable (PasskeyRequest) -> Void
  private var anchor: ASPresentationAnchor?
  private var controller: ASAuthorizationController?
  private var settled = false

  nonisolated init(
    ceremony: PasskeyCeremony,
    promise: Promise<String>,
    onSettle: @escaping @Sendable (PasskeyRequest) -> Void
  ) {
    self.ceremony = ceremony
    self.promise = promise
    self.onSettle = onSettle
    super.init()
  }

  func start() {
    guard let window = Self.presentationWindow() else {
      settle(.failure(passkeyError("unknown", "No window to present on")))
      return
    }
    anchor = window

    let request: ASAuthorizationRequest
    switch ceremony {
    case .registration(let parameters):
      request = Self.registrationRequest(parameters)
    case .assertion(let parameters):
      request = Self.assertionRequest(parameters)
    }

    let controller = ASAuthorizationController(authorizationRequests: [request])
    controller.delegate = self
    controller.presentationContextProvider = self
    self.controller = controller
    controller.performRequests()
  }
}

// MARK: ASAuthorizationControllerDelegate

extension PasskeyRequest: ASAuthorizationControllerDelegate {
  func authorizationController(
    controller: ASAuthorizationController,
    didCompleteWithAuthorization authorization: ASAuthorization
  ) {
    settle(Result { try responseJSON(for: authorization.credential) })
  }

  func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
    let token = PasskeyErrorToken.token(for: error)
    settle(.failure(passkeyError(token, error.localizedDescription)))
  }
}

// MARK: ASAuthorizationControllerPresentationContextProviding

extension PasskeyRequest: ASAuthorizationControllerPresentationContextProviding {
  func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
    // `start` sets the anchor before `performRequests`, so the fallback is never expected.
    anchor ?? ASPresentationAnchor()
  }
}

// MARK: Settlement, requests and responses

extension PasskeyRequest {
  /// Resolves or rejects the promise at most once and releases the in-flight slot.
  private func settle(_ result: Result<String, Error>) {
    guard !settled else { return }
    settled = true

    // Release the controller after the current delegate callback has returned, not while the
    // controller is still on the stack calling us.
    if let controller {
      controller.delegate = nil
      controller.presentationContextProvider = nil
      DispatchQueue.main.async {
        withExtendedLifetime(controller) {}
      }
    }
    controller = nil
    anchor = nil

    onSettle(self)

    switch result {
    case .success(let json):
      promise.resolve(withResult: json)
    case .failure(let error):
      promise.reject(withError: error)
    }
  }

  // MARK: Building requests

  private static func registrationRequest(
    _ parameters: RegistrationParameters
  ) -> ASAuthorizationPlatformPublicKeyCredentialRegistrationRequest {
    let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: parameters.rpID)
    let request = provider.createCredentialRegistrationRequest(
      challenge: parameters.challenge,
      name: parameters.userName,
      userID: parameters.userID
    )
    if let displayName = parameters.displayName, !displayName.isEmpty {
      request.displayName = displayName
    }
    if let userVerification = parameters.userVerification {
      request.userVerificationPreference = .init(rawValue: userVerification)
    }
    request.attestationPreference = .init(rawValue: parameters.attestation)
    if !parameters.excludedCredentialIDs.isEmpty, #available(iOS 17.4, *) {
      request.excludedCredentials = parameters.excludedCredentialIDs.map {
        ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: $0)
      }
    }
    return request
  }

  private static func assertionRequest(
    _ parameters: AssertionParameters
  ) -> ASAuthorizationPlatformPublicKeyCredentialAssertionRequest {
    let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: parameters.rpID)
    let request = provider.createCredentialAssertionRequest(challenge: parameters.challenge)
    if !parameters.allowedCredentialIDs.isEmpty {
      request.allowedCredentials = parameters.allowedCredentialIDs.map {
        ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: $0)
      }
    }
    if let userVerification = parameters.userVerification {
      request.userVerificationPreference = .init(rawValue: userVerification)
    }
    return request
  }

  // MARK: Building responses

  private func responseJSON(for credential: ASAuthorizationCredential) throws -> String {
    switch ceremony {
    case .registration:
      guard let registration = credential as? ASAuthorizationPlatformPublicKeyCredentialRegistration else {
        throw passkeyError("unknown", "Unexpected credential type")
      }
      guard let attestationObject = registration.rawAttestationObject, !attestationObject.isEmpty else {
        throw passkeyError("unknown", "Missing attestation object")
      }
      var attachment = "platform"
      if #available(iOS 16.6, *) {
        attachment = Self.attachmentName(registration.attachment)
      }
      return try PasskeyJSON.encode(
        PasskeyJSON.RegistrationResponse(
          credentialID: registration.credentialID,
          clientDataJSON: registration.rawClientDataJSON,
          attestationObject: attestationObject,
          attachment: attachment
        )
      )

    case .assertion:
      guard let assertion = credential as? ASAuthorizationPlatformPublicKeyCredentialAssertion else {
        throw passkeyError("unknown", "Unexpected credential type")
      }
      guard !assertion.rawAuthenticatorData.isEmpty else {
        throw passkeyError("unknown", "Missing authenticator data")
      }
      guard !assertion.signature.isEmpty else {
        throw passkeyError("unknown", "Missing signature")
      }
      var attachment = "platform"
      if #available(iOS 16.6, *) {
        attachment = Self.attachmentName(assertion.attachment)
      }
      return try PasskeyJSON.encode(
        PasskeyJSON.AssertionResponse(
          credentialID: assertion.credentialID,
          clientDataJSON: assertion.rawClientDataJSON,
          authenticatorData: assertion.rawAuthenticatorData,
          signature: assertion.signature,
          userID: assertion.userID,
          attachment: attachment
        )
      )
    }
  }

  @available(iOS 16.6, *)
  private static func attachmentName(_ attachment: ASAuthorizationPublicKeyCredentialAttachment) -> String {
    switch attachment {
    case .platform:
      return "platform"
    case .crossPlatform:
      return "cross-platform"
    @unknown default:
      return "platform"
    }
  }

  // MARK: Anchor

  /// Key window of the foreground-active scene, else the first window of any connected scene.
  private static func presentationWindow() -> UIWindow? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let activeScene = scenes.first { $0.activationState == .foregroundActive }
    if let keyWindow = activeScene?.keyWindow {
      return keyWindow
    }
    return scenes.lazy.compactMap { $0.windows.first }.first
  }
}
