package com.margelo.nitro.nitropasskeys

import com.margelo.nitro.core.Promise

class HybridNitroPasskeys : HybridNitroPasskeysSpec() {
  override val isSupported: Boolean
    get() = true

  override fun create(creationOptionsJson: String): Promise<String> =
      Promise.rejected(Error("[Passkeys:unknown] Not implemented"))

  override fun get(requestOptionsJson: String): Promise<String> =
      Promise.rejected(Error("[Passkeys:unknown] Not implemented"))
}
