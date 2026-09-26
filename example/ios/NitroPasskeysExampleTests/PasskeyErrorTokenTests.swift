import AuthenticationServices
@testable import NitroPasskeys
import XCTest

final class PasskeyErrorTokenTests: XCTestCase {
  private let notAssociated = "Application with identifier ABCDE.com.x is not associated with domain example.com"

  private func asauth(_ code: Int, _ userInfo: [String: Any] = [:]) -> NSError {
    NSError(domain: ASAuthorizationError.errorDomain, code: code, userInfo: userInfo)
  }

  func testEveryASAuthorizationCodeMapsToItsNumber() {
    for code in 1000...1006 {
      XCTAssertEqual(PasskeyErrorToken.token(for: asauth(code)), "asauth-\(code)")
    }
    XCTAssertEqual(PasskeyErrorToken.token(for: asauth(1006)), "asauth-1006")
  }

  func testDomainNotAssociatedInDescription() {
    let error = asauth(1004, [NSLocalizedDescriptionKey: notAssociated])
    XCTAssertEqual(PasskeyErrorToken.token(for: error), "domainNotAssociated")
  }

  func testDomainNotAssociatedInFailureReason() {
    let error = asauth(1004, [NSLocalizedFailureReasonErrorKey: notAssociated])
    XCTAssertEqual(PasskeyErrorToken.token(for: error), "domainNotAssociated")
  }

  func testDomainNotAssociatedInUnderlyingError() {
    let underlying = NSError(domain: "WKErrorDomain", code: 8, userInfo: [NSLocalizedDescriptionKey: notAssociated])
    let error = asauth(1004, [NSUnderlyingErrorKey: underlying])
    XCTAssertEqual(PasskeyErrorToken.token(for: error), "domainNotAssociated")
  }

  func testFailedWithOtherTextStaysNumeric() {
    let error = asauth(1004, [NSLocalizedDescriptionKey: "Something else went wrong"])
    XCTAssertEqual(PasskeyErrorToken.token(for: error), "asauth-1004")
  }

  func testNotAssociatedTextOnOtherCodeStaysNumeric() {
    let error = asauth(1001, [NSLocalizedDescriptionKey: notAssociated])
    XCTAssertEqual(PasskeyErrorToken.token(for: error), "asauth-1001")
  }

  func testNonASAuthorizationErrorIsUnknown() {
    let error = NSError(domain: NSCocoaErrorDomain, code: 1004, userInfo: [NSLocalizedDescriptionKey: notAssociated])
    XCTAssertEqual(PasskeyErrorToken.token(for: error), "unknown")
  }

  func testMessageFormat() {
    XCTAssertEqual(PasskeyErrorToken.message(token: "asauth-1001", "Canceled"), "[Passkeys:asauth-1001] Canceled")
  }
}
