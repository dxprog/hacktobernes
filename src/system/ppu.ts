import { Chip } from '../common/chip';
import { Cpu } from './cpu';

const REGISTER_ADDRESS_MASK = 0x7;
const REGISTER_ADDRESS_PPUCTL = 0x2;
const HORIZONTAL_SCAN_COUNT = 341;
const VERTICAL_SCAN_COUNT = 262;

const PPUCTL_FLAG_VBLANK = 0x80;

export class Ppu extends Chip {
  private horizontalCounter: number;
  private verticalCounter: number;
  private regPpuStatus: number;
  private nmiCallback: Function;

  constructor(nmiCallback: Function) {
    super();
    this.horizontalCounter = 0;
    this.verticalCounter = 0;
    this.regPpuStatus = 0;
    this.nmiCallback = nmiCallback;
  }

  clock() {
    this.horizontalCounter++;
    if (this.horizontalCounter >= HORIZONTAL_SCAN_COUNT) {
      this.verticalCounter++;
      this.horizontalCounter = 0;

      if (this.verticalCounter >= VERTICAL_SCAN_COUNT) {
        this.regPpuStatus |= PPUCTL_FLAG_VBLANK;
        console.log('vblank', this.regPpuStatus);
        this.nmiCallback();
        this.verticalCounter = 0;
      }
    }
  }

  read(address: number): number {
    const registerAddress = address & REGISTER_ADDRESS_MASK;
    if (registerAddress === REGISTER_ADDRESS_PPUCTL) {
      const tmp = this.regPpuStatus;
      this.regPpuStatus = 0;
      return tmp;
    }
    return 0;
  }

  write(address: number, value: number) {

  }
};
