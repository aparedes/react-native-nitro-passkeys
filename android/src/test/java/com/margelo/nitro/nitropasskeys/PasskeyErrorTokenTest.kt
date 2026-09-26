package com.margelo.nitro.nitropasskeys

import androidx.credentials.exceptions.CreateCredentialCancellationException
import androidx.credentials.exceptions.CreateCredentialInterruptedException
import androidx.credentials.exceptions.CreateCredentialNoCreateOptionException
import androidx.credentials.exceptions.CreateCredentialProviderConfigurationException
import androidx.credentials.exceptions.CreateCredentialUnknownException
import androidx.credentials.exceptions.CreateCredentialUnsupportedException
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialInterruptedException
import androidx.credentials.exceptions.GetCredentialProviderConfigurationException
import androidx.credentials.exceptions.GetCredentialUnknownException
import androidx.credentials.exceptions.GetCredentialUnsupportedException
import androidx.credentials.exceptions.NoCredentialException
import androidx.credentials.exceptions.domerrors.AbortError
import androidx.credentials.exceptions.domerrors.DataError
import androidx.credentials.exceptions.domerrors.DomError
import androidx.credentials.exceptions.domerrors.EncodingError
import androidx.credentials.exceptions.domerrors.InvalidStateError
import androidx.credentials.exceptions.domerrors.NetworkError
import androidx.credentials.exceptions.domerrors.NotAllowedError
import androidx.credentials.exceptions.domerrors.NotSupportedError
import androidx.credentials.exceptions.domerrors.SecurityError
import androidx.credentials.exceptions.domerrors.SyntaxError
import androidx.credentials.exceptions.domerrors.TimeoutError
import androidx.credentials.exceptions.publickeycredential.CreatePublicKeyCredentialDomException
import androidx.credentials.exceptions.publickeycredential.GetPublicKeyCredentialDomException
import org.json.JSONException
import org.junit.Assert.assertEquals
import org.junit.Test

class PasskeyErrorTokenTest {
  private fun create(d: DomError) = CreatePublicKeyCredentialDomException(d, "x")

  private fun get(d: DomError) = GetPublicKeyCredentialDomException(d, "x")

  private fun assertBoth(expected: String, d: () -> DomError) {
    assertEquals(expected, PasskeyErrorToken.token(create(d())))
    assertEquals(expected, PasskeyErrorToken.token(get(d())))
  }

  @Test
  fun invalidStateIsAlreadyRegisteredOnCreate() {
    assertEquals("alreadyRegistered", PasskeyErrorToken.token(create(InvalidStateError())))
  }

  @Test
  fun invalidStateIsUnknownOnGet() {
    assertEquals("unknown", PasskeyErrorToken.token(get(InvalidStateError())))
  }

  @Test fun notAllowedIsCanceled() = assertBoth("canceled") { NotAllowedError() }

  @Test fun abortIsCanceled() = assertBoth("canceled") { AbortError() }

  @Test fun timeoutIsCanceled() = assertBoth("canceled") { TimeoutError() }

  @Test fun securityIsDomainNotAssociated() = assertBoth("domainNotAssociated") { SecurityError() }

  @Test fun notSupportedIsUnsupported() = assertBoth("unsupported") { NotSupportedError() }

  @Test fun dataIsInvalidOptions() = assertBoth("invalidOptions") { DataError() }

  @Test fun encodingIsInvalidOptions() = assertBoth("invalidOptions") { EncodingError() }

  @Test fun syntaxIsInvalidOptions() = assertBoth("invalidOptions") { SyntaxError() }

  @Test fun otherDomErrorIsUnknown() = assertBoth("unknown") { NetworkError() }

  @Test
  fun cancellationsAreCanceled() {
    assertEquals("canceled", PasskeyErrorToken.token(GetCredentialCancellationException("x")))
    assertEquals("canceled", PasskeyErrorToken.token(CreateCredentialCancellationException("x")))
  }

  @Test
  fun noCredentialIsNoCredentials() {
    assertEquals("noCredentials", PasskeyErrorToken.token(NoCredentialException("x")))
  }

  @Test
  fun unsupportedClasses() {
    val errors =
        listOf(
            CreateCredentialProviderConfigurationException("x"),
            GetCredentialProviderConfigurationException("x"),
            CreateCredentialNoCreateOptionException("x"),
            CreateCredentialUnsupportedException("x"),
            GetCredentialUnsupportedException("x"),
        )
    for (e in errors) assertEquals(
        e.javaClass.simpleName,
        "unsupported",
        PasskeyErrorToken.token(e),
    )
  }

  @Test
  fun invalidOptionsExceptions() {
    assertEquals("invalidOptions", PasskeyErrorToken.token(IllegalArgumentException("x")))
    assertEquals("invalidOptions", PasskeyErrorToken.token(JSONException("x")))
  }

  @Test
  fun unknownFallbacks() {
    val errors =
        listOf(
            CreateCredentialInterruptedException("x"),
            GetCredentialInterruptedException("x"),
            CreateCredentialUnknownException("x"),
            GetCredentialUnknownException("x"),
            RuntimeException("x"),
        )
    for (e in errors) assertEquals(e.javaClass.simpleName, "unknown", PasskeyErrorToken.token(e))
  }

  @Test
  fun messageFormat() {
    assertEquals(
        "[Passkeys:canceled] boom",
        PasskeyErrorToken.message(GetCredentialCancellationException("boom")),
    )
    assertEquals(
        "[Passkeys:unknown] RuntimeException",
        PasskeyErrorToken.message(RuntimeException()),
    )
  }
}
