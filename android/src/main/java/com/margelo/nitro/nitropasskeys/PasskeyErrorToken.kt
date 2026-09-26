package com.margelo.nitro.nitropasskeys

import androidx.credentials.exceptions.CreateCredentialCancellationException
import androidx.credentials.exceptions.CreateCredentialNoCreateOptionException
import androidx.credentials.exceptions.CreateCredentialProviderConfigurationException
import androidx.credentials.exceptions.CreateCredentialUnsupportedException
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialProviderConfigurationException
import androidx.credentials.exceptions.GetCredentialUnsupportedException
import androidx.credentials.exceptions.NoCredentialException
import androidx.credentials.exceptions.domerrors.AbortError
import androidx.credentials.exceptions.domerrors.DataError
import androidx.credentials.exceptions.domerrors.DomError
import androidx.credentials.exceptions.domerrors.EncodingError
import androidx.credentials.exceptions.domerrors.InvalidStateError
import androidx.credentials.exceptions.domerrors.NotAllowedError
import androidx.credentials.exceptions.domerrors.NotSupportedError
import androidx.credentials.exceptions.domerrors.SecurityError
import androidx.credentials.exceptions.domerrors.SyntaxError
import androidx.credentials.exceptions.domerrors.TimeoutError
import androidx.credentials.exceptions.publickeycredential.CreatePublicKeyCredentialDomException
import androidx.credentials.exceptions.publickeycredential.GetPublicKeyCredentialDomException
import org.json.JSONException

/** Maps Credential Manager failures to the `[Passkeys:<token>]` tokens the JS layer parses. */
object PasskeyErrorToken {
  fun token(error: Throwable): String =
      when (error) {
        // DOM exceptions first: InvalidStateError means different things on create and on get.
        is CreatePublicKeyCredentialDomException ->
            if (error.domError is InvalidStateError) "alreadyRegistered"
            else domToken(error.domError)
        is GetPublicKeyCredentialDomException ->
            if (error.domError is InvalidStateError) "unknown" else domToken(error.domError)
        is GetCredentialCancellationException,
        is CreateCredentialCancellationException -> "canceled"
        is NoCredentialException -> "noCredentials"
        is CreateCredentialProviderConfigurationException,
        is GetCredentialProviderConfigurationException,
        is CreateCredentialNoCreateOptionException,
        is CreateCredentialUnsupportedException,
        is GetCredentialUnsupportedException -> "unsupported"
        // JSONException is defensive: the request constructors document IllegalArgumentException.
        is IllegalArgumentException,
        is JSONException -> "invalidOptions"
        else -> "unknown"
      }

  private fun domToken(d: DomError): String =
      when (d) {
        is NotAllowedError,
        is AbortError,
        is TimeoutError -> "canceled"
        is SecurityError -> "domainNotAssociated"
        is NotSupportedError -> "unsupported"
        is DataError,
        is EncodingError,
        is SyntaxError -> "invalidOptions"
        else -> "unknown"
      }

  fun message(error: Throwable): String =
      "[Passkeys:${token(error)}] ${error.message ?: error.javaClass.simpleName}"
}
