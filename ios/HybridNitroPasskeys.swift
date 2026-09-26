import NitroModules

class HybridNitroPasskeys: HybridNitroPasskeysSpec {
  var isSupported: Bool { true }

  func create(creationOptionsJson: String) throws -> Promise<String> {
    Promise.rejected(withError: RuntimeError.error(withMessage: "[Passkeys:unknown] Not implemented"))
  }

  func get(requestOptionsJson: String) throws -> Promise<String> {
    Promise.rejected(withError: RuntimeError.error(withMessage: "[Passkeys:unknown] Not implemented"))
  }
}
