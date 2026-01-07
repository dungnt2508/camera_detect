export class ApplicationStateMachine {
  constructor() {
    this.state = 'IDLE';
    this.noHandTimeout = 2000; // 2s không có tay → RESET
    this.lastHandTime = 0;
    this.resetTimeout = 500; // 0.5s trong RESET → IDLE
    this.resetStartTime = 0;
  }

  update(hasHand) {
    const now = Date.now();

    switch (this.state) {
      case 'IDLE':
        if (hasHand) {
          this.state = 'ACTIVE';
          this.lastHandTime = now;
        }
        break;

      case 'ACTIVE':
        if (hasHand) {
          this.lastHandTime = now;
        } else {
          if (now - this.lastHandTime >= this.noHandTimeout) {
            this.state = 'RESET';
            this.resetStartTime = now;
          }
        }
        break;

      case 'BROWSE':
        if (hasHand) {
          this.lastHandTime = now;
        } else {
          if (now - this.lastHandTime >= this.noHandTimeout) {
            this.state = 'RESET';
            this.resetStartTime = now;
          }
        }
        break;

      case 'TRY_ON':
        if (hasHand) {
          this.lastHandTime = now;
        } else {
          if (now - this.lastHandTime >= this.noHandTimeout) {
            this.state = 'RESET';
            this.resetStartTime = now;
          }
        }
        break;

      case 'RESET':
        if (hasHand) {
          this.state = 'ACTIVE';
          this.lastHandTime = now;
          this.resetStartTime = 0;
        } else {
          if (now - this.resetStartTime >= this.resetTimeout) {
            this.state = 'IDLE';
            this.resetStartTime = 0;
          }
        }
        break;
    }

    return this.state;
  }

  transitionTo(newState) {
    const validTransitions = {
      'IDLE': ['ACTIVE'],
      'ACTIVE': ['BROWSE', 'RESET'],
      'BROWSE': ['TRY_ON', 'RESET'],
      'TRY_ON': ['BROWSE', 'RESET'],
      'RESET': ['IDLE', 'ACTIVE']
    };

    if (validTransitions[this.state] && validTransitions[this.state].includes(newState)) {
      this.state = newState;
      if (newState !== 'RESET') {
        this.lastHandTime = Date.now();
      }
      return true;
    }
    return false;
  }

  getState() {
    return this.state;
  }

  reset() {
    this.state = 'IDLE';
    this.lastHandTime = 0;
    this.resetStartTime = 0;
  }
}

