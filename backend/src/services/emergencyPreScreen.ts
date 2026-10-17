export type EmergencyType =
  | 'chest_pain_breathlessness'
  | 'stroke_signs'
  | 'heavy_bleeding'
  | 'unconsciousness'
  | 'poisoning_overdose'
  | 'self_harm';

export interface EmergencyPreScreenResult {
  detected: boolean;
  type?: EmergencyType;
  message?: string;
}

const emergencyNumber = process.env.EMERGENCY_NUMBER || '112';

const emergencyRules: Array<{ type: EmergencyType; phrases: RegExp[] }> = [
  {
    type: 'chest_pain_breathlessness',
    phrases: [
      /\bchest pain\b/,
      /\bchest pressure\b/,
      /\bchest tightness\b/,
      /\b(?:cannot|cant|unable to|struggling to|trouble|difficulty) breathe\b/,
      /\b(?:trouble|difficulty) breathing\b/,
      /\bbreathlessness\b/,
      /\bbreathing difficulty\b/,
      /\bshortness of breath\b/,
      /\bshort of breath\b/,
      /\bgasping\b/,
      /\bnot breathing\b/,
      /\bsaans nahi aa rahi\b/,
      /\bseene me dard\b/,
    ],
  },
  {
    type: 'stroke_signs',
    phrases: [
      /\b(?:face drooping|facial drooping|drooping face)\b/,
      /\bslurred speech\b/,
      /\bone side (?:is )?weak\b/,
      /\bweakness on one side\b/,
      /\bdifficulty speaking suddenly\b/,
    ],
  },
  {
    type: 'heavy_bleeding',
    phrases: [
      /\b(?:severe|heavy) bleeding\b/,
      /\bbleeding heavily\b/,
      /\bbleeding that will not stop\b/,
    ],
  },
  {
    type: 'unconsciousness',
    phrases: [
      /\bunconscious\b/,
      /\bunresponsive\b/,
      /\bloss of consciousness\b/,
      /\bnot waking up\b/,
      /\bcannot be woken\b/,
      /\bnot responding\b/,
    ],
  },
  {
    type: 'poisoning_overdose',
    phrases: [
      /\bpoisoning\b/,
      /\bpoisoned\b/,
      /\boverdose\b/,
      /\btook too many (?:pills|tablets|medications)\b/,
    ],
  },
  {
    type: 'self_harm',
    phrases: [
      /\bwant to die\b/,
      /\b(?:want to|going to|plan to|might) (?:kill|hurt|harm) myself\b/,
      /\bkill myself\b/,
      /\bend my life\b/,
      /\bsuicide\b/,
      /\bself harm\b/,
    ],
  },
];

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/'/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function emergencyPreScreen(text: string): EmergencyPreScreenResult {
  const normalizedText = normalizeText(text);

  for (const rule of emergencyRules) {
    if (!rule.phrases.some((phrase) => phrase.test(normalizedText))) continue;

    const message =
      rule.type === 'self_harm'
        ? `Call ${emergencyNumber} now. If you may hurt yourself, contact emergency services now or go to the nearest emergency department. If possible, stay with someone you trust and ask them to help you get urgent support.`
        : `Call ${emergencyNumber} now. Contact emergency services now or go to the nearest emergency department. Do not drive yourself if you feel unwell.`;

    return { detected: true, type: rule.type, message };
  }

  return { detected: false };
}
