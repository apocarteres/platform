package io.github.apocarteres.platform.support;

// REQ-SUPPORT-009
public interface SupportLetters {

  void answered(AnswerNotice letter);

  void arrived(ArrivalNotice notice);
}
