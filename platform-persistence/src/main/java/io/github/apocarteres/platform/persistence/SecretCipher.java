package io.github.apocarteres.platform.persistence;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.AEADBadTagException;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

// REQ-SECRETS-001, REQ-SECRETS-002
public final class SecretCipher {

  private static final String TRANSFORMATION = "AES/GCM/NoPadding";
  private static final String ALGORITHM = "AES";
  private static final int NONCE_BYTES = 12;
  private static final int TAG_BITS = 128;
  private static final int MINIMUM_SECRET_LENGTH = 32;

  private final byte[] key;
  private final SecureRandom random = new SecureRandom();

  private SecretCipher(byte[] key) {
    this.key = key;
  }

  // REQ-SECRETS-002
  public static SecretCipher of(String secret) {
    if (secret == null || secret.length() < MINIMUM_SECRET_LENGTH) {
      throw new IllegalArgumentException(
        "Секрет шифрования короче " + MINIMUM_SECRET_LENGTH + " знаков: стойкость ключа задаёт сам секрет"
      );
    }
    return new SecretCipher(digestOf(secret));
  }

  // REQ-SECRETS-003
  public String encrypt(String plaintext, String recordId) {
    byte[] nonce = new byte[NONCE_BYTES];
    random.nextBytes(nonce);
    byte[] ciphertext = apply(Cipher.ENCRYPT_MODE, nonce, recordId, plaintext.getBytes(StandardCharsets.UTF_8));
    byte[] packed = new byte[nonce.length + ciphertext.length];
    System.arraycopy(nonce, 0, packed, 0, nonce.length);
    System.arraycopy(ciphertext, 0, packed, nonce.length, ciphertext.length);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(packed);
  }

  // REQ-SECRETS-003
  public String decrypt(String stored, String recordId) {
    byte[] packed = Base64.getUrlDecoder().decode(stored);
    if (packed.length <= NONCE_BYTES) {
      throw new IllegalArgumentException("Хранимый секрет короче заголовка: расшифровывать нечего");
    }
    byte[] nonce = Arrays.copyOfRange(packed, 0, NONCE_BYTES);
    byte[] ciphertext = Arrays.copyOfRange(packed, NONCE_BYTES, packed.length);
    return new String(apply(Cipher.DECRYPT_MODE, nonce, recordId, ciphertext), StandardCharsets.UTF_8);
  }

  private byte[] apply(int mode, byte[] nonce, String recordId, byte[] input) {
    try {
      Cipher cipher = Cipher.getInstance(TRANSFORMATION);
      cipher.init(mode, new SecretKeySpec(key, ALGORITHM), new GCMParameterSpec(TAG_BITS, nonce));
      cipher.updateAAD(recordId.getBytes(StandardCharsets.UTF_8));
      return cipher.doFinal(input);
    } catch (AEADBadTagException failure) {
      // REQ-SECRETS-003
      throw new SecretMismatchException(
        "Хранимый секрет не подтверждён: он зашифрован другим секретом, другой записью или изменён", failure
      );
    } catch (RuntimeException failure) {
      throw failure;
    } catch (Exception failure) {
      throw new IllegalStateException("Шифрование секрета не выполнено", failure);
    }
  }

  private static byte[] digestOf(String secret) {
    try {
      return MessageDigest.getInstance("SHA-256").digest(secret.getBytes(StandardCharsets.UTF_8));
    } catch (NoSuchAlgorithmException failure) {
      throw new IllegalStateException("SHA-256 недоступен", failure);
    }
  }
}
