import Foundation
import NitroModules

/// The WebAuthn JSON shapes iOS reads and writes. Decoders only declare the fields iOS uses;
/// unknown keys (`timeout`, `hints`, `extensions`, …) are ignored.
enum PasskeyJSON {
  // MARK: Options (JS → native)

  struct CreationOptions: Decodable {
    // swiftlint:disable:next identifier_name
    let rp: RelyingParty
    let user: User
    let challenge: String
    let excludeCredentials: [Descriptor]?
    let authenticatorSelection: Selection?
    let attestation: String?
  }

  struct RelyingParty: Decodable {
    let id: String?
  }

  struct User: Decodable {
    let id: String
    let name: String
    let displayName: String?
  }

  struct Descriptor: Decodable {
    let id: String
  }

  struct Selection: Decodable {
    let userVerification: String?
  }

  struct RequestOptions: Decodable {
    let challenge: String
    let rpId: String?
    let allowCredentials: [Descriptor]?
    let userVerification: String?
  }

  // MARK: Responses (native → JS)

  struct RegistrationResponseBody: Encodable {
    let clientDataJSON: String
    let attestationObject: String
    let transports: [String]
  }

  struct RegistrationResponse: Encodable {
    let id: String
    let rawId: String
    let type: String
    let authenticatorAttachment: String
    let clientExtensionResults: [String: String]
    let response: RegistrationResponseBody

    init(credentialID: Data, clientDataJSON: Data, attestationObject: Data, attachment: String) {
      let encodedID = Base64URL.encode(credentialID)
      id = encodedID
      rawId = encodedID
      type = "public-key"
      authenticatorAttachment = attachment
      clientExtensionResults = [:]
      response = RegistrationResponseBody(
        clientDataJSON: Base64URL.encode(clientDataJSON),
        attestationObject: Base64URL.encode(attestationObject),
        transports: ["internal", "hybrid"]
      )
    }
  }

  struct AssertionResponseBody: Encodable {
    let clientDataJSON: String
    let authenticatorData: String
    let signature: String
    /// `nil` is omitted from the output by the synthesized `encodeIfPresent`.
    let userHandle: String?
  }

  struct AssertionResponse: Encodable {
    let id: String
    let rawId: String
    let type: String
    let authenticatorAttachment: String
    let clientExtensionResults: [String: String]
    let response: AssertionResponseBody

    init(
      credentialID: Data,
      clientDataJSON: Data,
      authenticatorData: Data,
      signature: Data,
      userID: Data?,
      attachment: String
    ) {
      let encodedID = Base64URL.encode(credentialID)
      id = encodedID
      rawId = encodedID
      type = "public-key"
      authenticatorAttachment = attachment
      clientExtensionResults = [:]
      let userHandle = userID.flatMap { $0.isEmpty ? nil : Base64URL.encode($0) }
      response = AssertionResponseBody(
        clientDataJSON: Base64URL.encode(clientDataJSON),
        authenticatorData: Base64URL.encode(authenticatorData),
        signature: Base64URL.encode(signature),
        userHandle: userHandle
      )
    }
  }

  static func encode<T: Encodable>(_ value: T) throws -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.withoutEscapingSlashes]
    guard let json = String(bytes: try encoder.encode(value), encoding: .utf8) else {
      let message = PasskeyErrorToken.message(token: "unknown", "Could not encode the response")
      throw RuntimeError.error(withMessage: message)
    }
    return json
  }
}

// MARK: - Validated parameters

/// Decoded, validated `create` inputs. Plain values only, so they can cross to the main thread.
struct RegistrationParameters: Sendable {
  let rpID: String
  let challenge: Data
  let userName: String
  let userID: Data
  let displayName: String?
  let userVerification: String?
  let attestation: String
  let excludedCredentialIDs: [Data]

  init(json: String) throws {
    let options = try decodeOptions(PasskeyJSON.CreationOptions.self, from: json, label: "creation")
    guard let rpID = options.rp.id, !rpID.isEmpty else {
      throw invalidOptions("rp.id is required")
    }
    self.rpID = rpID
    challenge = try decodeField(options.challenge, "challenge")
    userName = options.user.name
    userID = try decodeField(options.user.id, "user.id")
    displayName = options.user.displayName
    userVerification = options.authenticatorSelection?.userVerification
    attestation = options.attestation ?? "none"
    excludedCredentialIDs = try (options.excludeCredentials ?? []).enumerated().map { index, descriptor in
      try decodeField(descriptor.id, "excludeCredentials[\(index)].id")
    }
  }
}

/// Decoded, validated `get` inputs.
struct AssertionParameters: Sendable {
  let rpID: String
  let challenge: Data
  let userVerification: String?
  let allowedCredentialIDs: [Data]

  init(json: String) throws {
    let options = try decodeOptions(PasskeyJSON.RequestOptions.self, from: json, label: "request")
    guard let rpID = options.rpId, !rpID.isEmpty else {
      throw invalidOptions("rpId is required")
    }
    self.rpID = rpID
    challenge = try decodeField(options.challenge, "challenge")
    userVerification = options.userVerification
    allowedCredentialIDs = try (options.allowCredentials ?? []).enumerated().map { index, descriptor in
      try decodeField(descriptor.id, "allowCredentials[\(index)].id")
    }
  }
}

private func invalidOptions(_ text: String) -> Error {
  RuntimeError.error(withMessage: PasskeyErrorToken.message(token: "invalidOptions", text))
}

private func decodeOptions<T: Decodable>(_ type: T.Type, from json: String, label: String) throws -> T {
  do {
    return try JSONDecoder().decode(type, from: Data(json.utf8))
  } catch {
    throw invalidOptions("Invalid \(label) options JSON: \(error.localizedDescription)")
  }
}

private func decodeField(_ value: String, _ name: String) throws -> Data {
  guard let data = Base64URL.decode(value) else {
    throw invalidOptions("\(name) is not valid base64url")
  }
  return data
}
