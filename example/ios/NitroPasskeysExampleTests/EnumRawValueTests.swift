import AuthenticationServices
import XCTest

/// `HybridNitroPasskeys` maps WebAuthn strings with `init(rawValue:)`. That is only correct while
/// AuthenticationServices' constants keep the WebAuthn spellings as their raw values.
final class EnumRawValueTests: XCTestCase {
  func testUserVerificationPreferenceRawValuesMatchWebAuthn() {
    typealias Preference = ASAuthorizationPublicKeyCredentialUserVerificationPreference
    XCTAssertEqual(Preference(rawValue: "discouraged"), .discouraged)
    XCTAssertEqual(Preference(rawValue: "preferred"), .preferred)
    XCTAssertEqual(Preference(rawValue: "required"), .required)
  }

  func testAttestationKindRawValuesMatchWebAuthn() {
    typealias Kind = ASAuthorizationPublicKeyCredentialAttestationKind
    XCTAssertEqual(Kind(rawValue: "none"), .none)
    XCTAssertEqual(Kind(rawValue: "direct"), .direct)
    XCTAssertEqual(Kind(rawValue: "indirect"), .indirect)
    XCTAssertEqual(Kind(rawValue: "enterprise"), .enterprise)
  }
}
