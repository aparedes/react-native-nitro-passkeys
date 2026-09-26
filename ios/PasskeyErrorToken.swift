import AuthenticationServices
import Foundation

/// Maps native errors to the `[Passkeys:<token>]` tokens that `PasskeyError.from` parses in JS.
enum PasskeyErrorToken {
  private static let notAssociatedMarker = "is not associated with domain"

  static func token(for error: Error) -> String {
    let nsError = error as NSError
    guard nsError.domain == ASAuthorizationError.errorDomain else { return "unknown" }
    if nsError.code == ASAuthorizationError.Code.failed.rawValue, isDomainNotAssociated(nsError) {
      return "domainNotAssociated"
    }
    return "asauth-\(nsError.code)"
  }

  /// True when the error (or any underlying error) says the app is not associated with the RP
  /// domain, i.e. the Associated Domains entitlement or the AASA file is missing or wrong.
  static func isDomainNotAssociated(_ error: NSError) -> Bool {
    if error.localizedDescription.contains(notAssociatedMarker) { return true }
    let reason = error.userInfo[NSLocalizedFailureReasonErrorKey] as? String
    if reason?.contains(notAssociatedMarker) == true { return true }
    if let underlying = error.userInfo[NSUnderlyingErrorKey] as? NSError {
      return isDomainNotAssociated(underlying)
    }
    return false
  }

  static func message(token: String, _ text: String) -> String {
    "[Passkeys:\(token)] \(text)"
  }
}
