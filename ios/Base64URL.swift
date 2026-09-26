import Foundation

/// Unpadded base64url (RFC 4648 §5), the encoding WebAuthn JSON uses for every binary field.
enum Base64URL {
  private static let alphabet = Set(
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_="
  )

  /// Encodes `data` as base64url with `+`→`-`, `/`→`_` and no `=` padding.
  static func encode(_ data: Data) -> String {
    data.base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }

  /// Decodes padded or unpadded base64url. Returns `nil` for empty input, any character outside the
  /// base64url alphabet (including `+`, `/` and whitespace) or an impossible length.
  static func decode(_ string: String) -> Data? {
    guard !string.isEmpty, string.allSatisfy({ alphabet.contains($0) }) else { return nil }

    var unpadded = Substring(string)
    while unpadded.last == "=" {
      unpadded = unpadded.dropLast()
    }
    guard unpadded.count % 4 != 1 else { return nil }

    var base64 = unpadded
      .replacingOccurrences(of: "-", with: "+")
      .replacingOccurrences(of: "_", with: "/")
    let remainder = base64.count % 4
    if remainder != 0 {
      base64 += String(repeating: "=", count: 4 - remainder)
    }
    return Data(base64Encoded: base64)
  }
}
