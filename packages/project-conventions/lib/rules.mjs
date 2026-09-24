import { findProseComments } from './comments.mjs';
import { findSystemClockUses } from './clock.mjs';
import { toRule, validate } from './project-rules.mjs';
import { findNamingViolations } from './naming.mjs';
import { findMoneyViolations } from './money.mjs';
import { findOversizedFiles } from './filesize.mjs';
import { findConfigSecrets } from './secrets.mjs';
import { findDependencyIssues } from './dependencies.mjs';
import { findNamingIssues } from './document-naming.mjs';
import { findForbiddenWords, findLongWordings } from './terms.mjs';
import { findSourceSetsWithoutAnalysis } from './static-analysis.mjs';
import { findRustExemptions } from './rust-exemptions.mjs';
import { findOrderSensitiveWiring } from './wiring.mjs';
import { findMissingDeployEntry } from './deploy-entry.mjs';
import { findUndeliveredConfiguration } from './environment-config.mjs';
import { findModalsWithoutEscape } from './modal-escape.mjs';
import { findUndeclaredModalButtons } from './modal-actions.mjs';
import { DIRECTIVE, RECOMMENDATION } from './levels.mjs';
import { SET } from './baseline.mjs';

export { DIRECTIVE, LEVELS, RECOMMENDATION } from './levels.mjs';

export const RULES = [
  {
    id: 'terms-alias',
    level: DIRECTIVE,
    document: 'REQ-TERMS',
    file: 'terminology.md',
    summary: 'Слово из подстановок словаря в текстах не употребляется',
    title: 'запрещённых словарём слов',
    find: findForbiddenWords,
  },
  {
    id: 'terms-preferred',
    level: RECOMMENDATION,
    document: 'REQ-TERMS',
    file: 'terminology.md',
    summary: 'Вместо длинного оборота употребляется термин словаря',
    title: 'длинных оборотов вместо термина',
    find: findLongWordings,
  },
  {
    id: 'comments',
    level: DIRECTIVE,
    document: 'REQ-CODE-COMMENTS',
    file: 'code-comments.md',
    summary: 'Комментарий допустим только как ссылка на документ; пояснительный текст запрещён',
    title: 'пояснительных комментариев',
    find: findProseComments,
  },
  {
    id: 'clock',
    level: DIRECTIVE,
    document: 'REQ-CODE-CLOCK',
    file: 'code-clock.md',
    summary: 'Время только через интерфейс часов; прямое обращение к системным часам запрещено',
    title: 'обращений к системным часам',
    find: findSystemClockUses,
  },
  {
    id: 'money-types',
    level: DIRECTIVE,
    document: 'REQ-CODE-DESIGN',
    file: 'code-design.md',
    summary: 'Денежная величина не объявляется двоичной плавающей арифметикой',
    title: 'денежных величин на double или float',
    find: findMoneyViolations,
  },
  {
    id: 'file-size',
    level: DIRECTIVE,
    document: 'REQ-CODE-DESIGN',
    file: 'code-design.md',
    summary: 'Файл длиннее предела делится; предел не поднимается',
    title: 'строк сверх предела',
    find: findOversizedFiles,
  },
  {
    id: 'config-secrets',
    level: DIRECTIVE,
    document: 'REQ-CONFIG',
    file: 'configuration.md',
    summary: 'Чувствительное свойство конфигурации задаётся только подстановкой из окружения',
    title: 'свойств с литеральным значением',
    find: findConfigSecrets,
  },
  {
    id: 'dependency-versions',
    level: DIRECTIVE,
    document: 'REQ-DEPS',
    file: 'dependencies.md',
    summary: 'Версиями платформы приложений и её компонентов управляет ядро; мёртвое свойство версии запрещено',
    title: 'версий, которыми потребитель не управляет',
    find: findDependencyIssues,
  },
  {
    id: 'document-naming',
    level: DIRECTIVE,
    document: 'REQ-NAMING',
    file: 'naming.md',
    summary: 'Идентификатор, имя файла и область документа соответствуют схеме',
    title: 'расхождений имени и идентификатора',
    find: findNamingIssues,
  },
  {
    id: 'static-analysis',
    level: DIRECTIVE,
    document: 'REQ-QUALITY',
    file: 'quality-checks.md',
    summary: 'Каждый набор исходников несёт статический разбор, роняющий сборку на предупреждениях',
    title: 'наборов исходников без статического разбора',
    find: findSourceSetsWithoutAnalysis,
  },
  {
    id: 'deploy-entry',
    level: DIRECTIVE,
    document: 'REQ-DEPLOYMENT',
    file: 'deployment.md',
    summary: 'У объявленного развёртывания есть вход scripts/deploy.sh — один и тот же во всех проектах',
    title: 'объявлений развёртывания без входа',
    find: findMissingDeployEntry,
  },
  {
    id: 'environment-config',
    level: DIRECTIVE,
    document: 'REQ-DEPLOYMENT',
    file: 'deployment.md',
    summary: 'Настройка веб-сервера и описание службы объявлены составляющими и едут развёртыванием',
    title: 'настроек среды вне составляющих',
    find: findUndeliveredConfiguration,
  },
  {
    id: 'modal-escape',
    level: DIRECTIVE,
    document: 'REQ-CLIENT-MODAL',
    file: 'client-modals.md',
    summary: 'Каждое модальное окно объявлено директивой apcrModal: решение об Escape принято явно, хотя бы как ESCAPE_IGNORED',
    title: 'модальных окон без решения об Escape',
    find: findModalsWithoutEscape,
  },
  {
    id: 'modal-actions',
    level: DIRECTIVE,
    document: 'REQ-CLIENT-MODAL',
    file: 'client-modals.md',
    summary: 'Каждая кнопка модального окна объявляет, удалённое ли у неё действие: apcrAction ждёт ответа, apcrLocal — местная',
    title: 'кнопок модальных окон без объявления действия',
    find: findUndeclaredModalButtons,
  },
  {
    id: 'wiring-conditions',
    level: DIRECTIVE,
    document: 'REQ-QUALITY',
    file: 'quality-checks.md',
    summary: 'Автонастройка не решает условием о чужом бине: порядок автонастроек ей не принадлежит',
    title: 'условий автонастройки, зависящих от порядка',
    find: findOrderSensitiveWiring,
  },
  {
    id: 'rust-exemptions',
    level: DIRECTIVE,
    document: 'REQ-QUALITY',
    file: 'quality-checks.md',
    summary: 'Объявленные в коде послабления разбора Rust ведутся ограничителем множеством и могут только убывать',
    title: 'объявленных послаблений разбора',
    unit: SET,
    find: findRustExemptions,
  },
  {
    id: 'naming-er',
    level: RECOMMENDATION,
    document: 'REQ-JAVA-NAMING',
    file: 'java-naming.md',
    summary: 'Имя типа не оканчивается на -er вне перечня образцов и доменных существительных',
    title: 'имён с суффиксом -er вне перечня',
    find: findNamingViolations,
  },
];

export function projectRules(config) {
  const entries = config.rules ?? [];
  const errors = validate(entries, new Set(RULES.map((rule) => rule.id)));
  return { rules: errors.length > 0 ? [] : entries.map(toRule), errors };
}

export function allRules(config) {
  const { rules, errors } = projectRules(config);
  return { rules: [...RULES, ...rules], errors };
}
