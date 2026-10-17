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
      /chest pain.{0,80}(shortness of breath|breathlessness|breathing difficulty|difficulty breathing)/i,
      /(shortness of breath|breathlessness|breathing difficulty|difficulty breathing).{0,80}chest pain/i,
    ],
  },
  {
    type: 'stroke_signs',
    phrases: [
      /face drooping|facial drooping|drooping face/i,
      /slurred speech|speech is slurred|difficulty speaking suddenly/i,
    ],
  },
  {
    type: 'heavy_bleeding',
    phrases: [/severe bleeding|heavy bleeding|bleeding heavily|bleeding that will not stop/i],
  },
  {
    type: 'unconsciousness',
    phrases: [/unconscious|loss of consciousness|not waking up|cannot be woken/i],
  },
  {
    type: 'poisoning_overdose',
    phrases: [/poisoning|poisoned|overdose|took too many (pills|tablets|medications)/i],
  },
  {
    type: 'self_harm',
    phrases: [
      /(?:want to|going to|plan to|might) (?:kill|hurt|harm) myself/i,
      /(?:suicidal|suicide plan|self[- ]harm|end my life)/i,
    ],
  },
];

export function emergencyPreScreen(text: string): EmergencyPreScreenResult {
  for (const rule of emergencyRules) {
    if (!rule.phrases.some((phrase) => phrase.test(text))) continue;

    if (rule.type === 'self_harm') {
      return {
        detected: true,
        type: rule.type,
        message: `I'm sorry you're going through this. If you may hurt yourself now, call ${emergencyNumber} or go to the nearest emergency department. If possible, stay with someone you trust and ask them to help you get urgent support.`,
      };
    }

    return {
      detected: true,
      type: rule.type,
      message: `This may need urgent medical attention. Call ${emergencyNumber} now or go to the nearest emergency department. Do not drive yourself if you feel unwell.`,
    };
  }

  return { detected: false };
}
