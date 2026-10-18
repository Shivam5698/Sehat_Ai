import jwt from 'jsonwebtoken';

export class TruGenTokenService {
  private apiSecret: string;

  constructor(apiSecret: string) {
    this.apiSecret = apiSecret;
  }

  generateSessionToken(sessionId: string, expiresIn: string = '1h'): string {
    if (!this.apiSecret) throw new Error('TRUGEN_API_SECRET must be configured');
    return jwt.sign({ sessionId }, this.apiSecret, {
      expiresIn,
    });
  }

  verifySessionToken(token: string): string | null {
    if (!this.apiSecret) return null;
    try {
      const decoded = jwt.verify(token, this.apiSecret) as { sessionId: string };
      return decoded.sessionId;
    } catch (error) {
      return null;
    }
  }
}
