package io.github.apocarteres.platform.web.errors;

import org.springframework.http.HttpStatus;
import org.springframework.util.Assert;

// REQ-API-001
public record ErrorCode(String value, HttpStatus status) {

  public ErrorCode {
    Assert.hasText(value, "Код ошибки обязателен");
    Assert.notNull(status, "Статус обязателен");
  }

  public static ErrorCode of(String value, HttpStatus status) {
    return new ErrorCode(value, status);
  }
}
