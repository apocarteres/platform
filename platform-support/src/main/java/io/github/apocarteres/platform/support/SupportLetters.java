package io.github.apocarteres.platform.support;

// REQ-SUPPORT-009
public interface SupportLetters {

  void answered(AnswerLetter letter);

  void arrived(ArrivalNotice notice);
}
