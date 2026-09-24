package io.github.apocarteres.platform.api.version.internal;

import io.github.apocarteres.platform.api.version.ApiVersion;
import java.util.List;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.context.annotation.Bean;
import org.springframework.core.env.Environment;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

// REQ-CLIENT-UPDATE-005, REQ-CLIENT-UPDATE-006
@AutoConfiguration
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class ApiVersionAutoConfiguration {

  // REQ-CLIENT-UPDATE-005
  static final String MINIMUM = "platform.api.min-supported-version";

  // REQ-CLIENT-UPDATE-006
  static final String EXEMPT = "platform.api.version-exempt-paths";

  @Bean
  WebMvcConfigurer apiVersionCheck(Environment environment) {
    ApiVersion minimum = minimumOf(environment);
    List<String> exempt = Binder.get(environment).bind(EXEMPT, Bindable.listOf(String.class)).orElse(List.of());
    return new WebMvcConfigurer() {
      @Override
      public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new ApiVersionInterceptor(minimum)).excludePathPatterns(exempt);
      }
    };
  }

  // REQ-CLIENT-UPDATE-005
  static ApiVersion minimumOf(Environment environment) {
    String declared = environment.getProperty(MINIMUM);
    if (declared == null) {
      throw new IllegalStateException("Не задана настройка " + MINIMUM + ": минимальная версия API, которую сервер"
        + " принимает от клиента. Задайте её целым числом от 1 и поднимайте, когда прежний клиент перестаёт понимать API");
    }
    return ApiVersion.parse(declared.trim()).orElseThrow(() -> new IllegalStateException(
      "Настройка " + MINIMUM + "=" + declared + " недопустима: целое число от 1 до 999999999"));
  }
}
