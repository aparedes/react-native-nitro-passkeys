package com.margelo.nitro.nitropasskeys

import android.os.Build
import androidx.credentials.CreatePublicKeyCredentialRequest
import androidx.credentials.CreatePublicKeyCredentialResponse
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetPublicKeyCredentialOption
import androidx.credentials.PublicKeyCredential
import com.margelo.nitro.NitroModules
import com.margelo.nitro.core.Promise
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

class HybridNitroPasskeys : HybridNitroPasskeysSpec() {
  override val isSupported: Boolean
    get() = Build.VERSION.SDK_INT >= 28

  private val inFlight = AtomicBoolean(false)
  private val mainScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

  override fun create(creationOptionsJson: String): Promise<String> = runExclusive {
    val activity = requireActivity()
    // Constructed here because it can throw IllegalArgumentException.
    val request = CreatePublicKeyCredentialRequest(requestJson = creationOptionsJson)
    val response = CredentialManager.create(activity).createCredential(activity, request)
    (response as? CreatePublicKeyCredentialResponse)?.registrationResponseJson
        ?: throw Error("[Passkeys:unknown] Unexpected response type")
  }

  override fun get(requestOptionsJson: String): Promise<String> = runExclusive {
    val activity = requireActivity()
    val request =
        GetCredentialRequest(listOf(GetPublicKeyCredentialOption(requestJson = requestOptionsJson)))
    val result = CredentialManager.create(activity).getCredential(activity, request)
    (result.credential as? PublicKeyCredential)?.authenticationResponseJson
        ?: throw Error("[Passkeys:unknown] Unexpected credential type")
  }

  private fun requireActivity() =
      NitroModules.applicationContext?.currentActivity
          ?: throw Error("[Passkeys:unknown] No current Activity")

  /**
   * Runs [block] on the main scope with a single-flight guard. The guard is released on every path
   * (success, any throw, cancellation). Errors are rethrown with a `[Passkeys:<token>]` prefix.
   */
  private fun runExclusive(block: suspend () -> String): Promise<String> {
    if (!inFlight.compareAndSet(false, true)) {
      return Promise.rejected(Error("[Passkeys:unknown] A passkey request is already in progress"))
    }
    return Promise.async(mainScope) {
      try {
        block()
      } catch (e: Throwable) {
        if (e.message?.contains("[Passkeys:") == true) throw e
        throw Error(PasskeyErrorToken.message(e))
      } finally {
        inFlight.set(false)
      }
    }
  }
}
