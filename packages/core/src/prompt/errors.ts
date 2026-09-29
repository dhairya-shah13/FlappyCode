export class RulesMissingError extends Error {
  readonly code = 'ERR_RULES_MISSING';

  constructor(message = 'Operating rules are mandatory and cannot be omitted from agent prompts.') {
    super(message);
    this.name = 'RulesMissingError';
  }
}
