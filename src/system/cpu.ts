import { MAX_ADDRESS } from '../common/constants';
import { Bus } from './bus';

const NMI_VECTOR_ADDR = 0xfffa;
const RESET_VECTOR_ADDR = 0xfffc;
const IRQ_VECTOR_ADDR = 0xfffe;

// status flag masks
const SW_DEFAULT = 0x20;
const SW_FLAG_CARRY = 0x01;
const SW_FLAG_ZERO = 0x02;
const SW_FLAG_INT_DISABLE = 0x04;
const SW_FLAG_BCD_ENABLE = 0x08;
const SW_FLAG_OVERFLOW = 0x40;
const SW_FLAG_NEGATIVE = 0x80;
type ProcessorFlag = (
  typeof SW_FLAG_CARRY |
  typeof SW_FLAG_ZERO |
  typeof SW_FLAG_INT_DISABLE |
  typeof SW_FLAG_BCD_ENABLE |
  typeof SW_FLAG_OVERFLOW |
  typeof SW_FLAG_NEGATIVE
);

export class Cpu {
  private bus: Bus;
  // accumulator
  private regA: number;
  // X register
  private regX: number;
  // Y register
  private regY: number;
  // program counter
  private regPC: number;
  // status word
  private regSW: number;
  // stack pointer
  private regSP: number;

  private opCodeMap: Record<number, Function>;

  private instructionCounter: number = 0;

  constructor(bus: Bus) {
    this.bus = bus;
    this.buildOpCodeMap();
  }

  buildOpCodeMap() {
    this.opCodeMap = {
      [0x78]: () => this.setFlag(SW_FLAG_INT_DISABLE, 1),
      [0xD8]: () => this.setFlag(SW_FLAG_BCD_ENABLE, 0),
      // LDA
      [0xA9]: () => this.lda(this.readUint8()), // immediate
    };
  }

  reset() {
    this.bus.setBusDirection('read');
    this.setAddr(RESET_VECTOR_ADDR);
    const vector = this.readUint16();
    console.log('reset vector:', vector.toString(16));
    this.setAddr(vector);

    // reset the registers
    this.regSP = 0xff;
    this.regA = 0;
    this.regX = 0;
    this.regY = 0;
    this.regSW = SW_DEFAULT;
  }

  clock() {
    // don't do anything until the current instructio is "being completed"
    if (this.instructionCounter > 0) {
      this.instructionCounter--;
      return;
    }

    // fetch the next opcode
    const opcode = this.readUint8();

    if (this.opCodeMap[opcode]) {
      this.opCodeMap[opcode]();
    } else {
      console.log('unknown opcode: ', opcode.toString(16));
    }
  }

  // utility methods

  private setAddr(address: number) {
    this.regPC = address & MAX_ADDRESS;
    this.bus.setAddr(address);
  }

  private readUint8(): number {
    this.bus.setBusDirection('read');
    const value = this.bus.getBusValue();
    this.bus.setAddr((++this.regPC) & MAX_ADDRESS);
    return value;
  }

  private readUint16() {
    const lowByte = this.readUint8();
    const highByte = this.readUint8();
    return (highByte << 8) | lowByte;
  }

  private setFlag(flag: ProcessorFlag, value: number) {
    const bit = (value & 0x1) << flag;
    this.regSW &= bit;
  }

  // instructions

  private lda(value: number) {
    this.instructionCounter++;
    this.regA = value;
  }

}
