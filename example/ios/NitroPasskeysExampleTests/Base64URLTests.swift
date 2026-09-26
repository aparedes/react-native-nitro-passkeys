@testable import NitroPasskeys
import XCTest

final class Base64URLTests: XCTestCase {
  func testRoundTripsEveryRemainder() {
    for length in 0...6 {
      let data = Data((0..<length).map { UInt8(truncatingIfNeeded: $0 &* 37 &+ 11) })
      let encoded = Base64URL.encode(data)
      XCTAssertFalse(encoded.contains("="), "length \(length) produced padding: \(encoded)")
      if length == 0 {
        // Empty input encodes to "" and "" is rejected on decode (never a valid WebAuthn field).
        XCTAssertEqual(encoded, "")
        XCTAssertNil(Base64URL.decode(encoded))
      } else {
        XCTAssertEqual(Base64URL.decode(encoded), data, "length \(length) did not round-trip")
      }
    }
  }

  func testNeverEmitsPlusOrSlash() {
    let encoded = Base64URL.encode(Data([0xfb, 0xff, 0xbf]))
    XCTAssertEqual(encoded, "-_-_")
    XCTAssertFalse(encoded.contains("+"))
    XCTAssertFalse(encoded.contains("/"))
  }

  func testDecodesPaddedAndUnpadded() {
    XCTAssertEqual(Base64URL.decode("AQ"), Data([0x01]))
    XCTAssertEqual(Base64URL.decode("AQ=="), Data([0x01]))
    XCTAssertEqual(Base64URL.decode("AQI"), Data([0x01, 0x02]))
    XCTAssertEqual(Base64URL.decode("AQI="), Data([0x01, 0x02]))
    XCTAssertEqual(Base64URL.decode("-_-_"), Data([0xfb, 0xff, 0xbf]))
  }

  func testRejectsNonBase64URLInput() {
    XCTAssertNil(Base64URL.decode("+_-_"))
    XCTAssertNil(Base64URL.decode("-/-_"))
    XCTAssertNil(Base64URL.decode("AQ I"))
    XCTAssertNil(Base64URL.decode("AQI\n"))
    XCTAssertNil(Base64URL.decode(""))
  }

  func testRejectsImpossibleLength() {
    XCTAssertNil(Base64URL.decode("A"))
    XCTAssertNil(Base64URL.decode("AQIDB"))
    XCTAssertNil(Base64URL.decode("AQIDB==="))
  }
}
