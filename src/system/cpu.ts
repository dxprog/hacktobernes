import { MAX_ADDRESS, MAX_BYTE } from '../common/constants';
import { Bus } from './bus';

const NMI_VECTOR_ADDR = 0xfffa;
const RESET_VECTOR_ADDR = 0xfffc;
const IRQ_VECTOR_ADDR = 0xfffe;

// status flag masks
const SW_DEFAULT = 0x20;
const SW_FLAG_CARRY_BIT = 0;
const SW_FLAG_CARRY_MASK = 0x01;
const SW_FLAG_ZERO_BIT = 1;
const SW_FLAG_ZERO_MASK = 1 << SW_FLAG_ZERO_BIT;
const SW_FLAG_INT_DISABLE = 0x04;
const SW_FLAG_BCD_ENABLE = 0x08;
const SW_FLAG_OVERFLOW_BIT = 6;
const SW_FLAG_OVERFLOW_MASK = 1 << SW_FLAG_OVERFLOW_BIT;
const SW_FLAG_NEGATIVE_BIT = 7;
const SW_FLAG_NEGATIVE_MASK = 1 << SW_FLAG_NEGATIVE_BIT;
type ProcessorFlag = (
  typeof SW_FLAG_CARRY_BIT |
  typeof SW_FLAG_ZERO_BIT |
  typeof SW_FLAG_INT_DISABLE |
  typeof SW_FLAG_BCD_ENABLE |
  typeof SW_FLAG_OVERFLOW_BIT |
  typeof SW_FLAG_NEGATIVE_BIT
);

type OpCodeDescriptor = {
  instruction: string;
  callable: Function;
}

export class Cpu {
  private bus: Bus;
  // accumulator
  private _regA: number;
  private set regA(value: number) {
    this._regA = value;
    this.setRegisterFlags(value);
  }
  private get regA(): number {
    return this._regA;
  }

  // X register
  private _regX: number;
  private set regX(value: number) {
    this._regX = value;
    this.setRegisterFlags(value);
  }
  private get regX(): number {
    return this._regX;
  }

  // Y register
  private _regY: number;
  private set regY(value: number) {
    this._regY = value;
    this.setRegisterFlags(value);
  }
  private get regY(): number {
    return this._regY;
  }


  // program counter
  private regPC: number;
  // status word
  private regSW: number;
  // stack pointer
  private regSP: number;

  private opCodeMap: Record<number, OpCodeDescriptor>;

  private instructionCounter: number = 0;

  constructor(bus: Bus) {
    this.bus = bus;
    this.buildOpCodeMap();
    this.ror = this.ror.bind(this);
    this.rol = this.rol.bind(this);
  }

  buildOpCodeMap() {
    this.opCodeMap = {
      [0x78]: { instruction: 'SEI', callable: () => this.setFlag(SW_FLAG_INT_DISABLE, true) },
      [0xD8]: { instruction: 'CLD', callable: () => this.setFlag(SW_FLAG_BCD_ENABLE, false) },
      [0x38]: { instruction: 'SEC', callable: () => this.setFlag(SW_FLAG_CARRY_BIT, true) },
      [0x18]: { instruction: 'CLC', callable: () => this.setFlag(SW_FLAG_CARRY_BIT, false)},

      // LDA
      [0xA9]: { instruction: 'LDA', callable: () => this.regA = this.addrImmediate() },
      [0xA5]: { instruction: 'LDA', callable: () => this.regA = this.readUint8AtAddress(this.addrZeroPage()) },
      [0xAD]: { instruction: 'LDA', callable: () => this.regA = this.readUint8AtAddress(this.addrAbsolute()) },
      [0xBD]: { instruction: 'LDA', callable: () => this.regA = this.readUint8AtAddress(this.addrAbsoluteX()) },
      [0xB9]: { instruction: 'LDA', callable: () => this.regA = this.readUint8AtAddress(this.addrAbsoluteY()) },
      [0xA1]: { instruction: 'LDA', callable: () => this.regA = this.readUint8AtAddress(this.addrIndirectX()) },
      [0xB1]: { instruction: 'LDA', callable: () => this.regA = this.readUint8AtAddress(this.addrIndirectY()) },

      // LDY
      [0xA0]: { instruction: 'LDY', callable: () => this.regY = this.addrImmediate() },
      [0xA4]: { instruction: 'LDY', callable: () => this.regY = this.readUint8AtAddress(this.addrZeroPage()) },
      [0xAC]: { instruction: 'LDY', callable: () => this.regY = this.readUint8AtAddress(this.addrAbsolute()) },

      // STA
      [0x85]: { instruction: 'STA', callable: () => this.store(this.regA, this.addrZeroPage()) },
      [0x95]: { instruction: 'STA', callable: () => this.store(this.regA, this.addrZeroPageX()) },
      [0x8D]: { instruction: 'STA', callable: () => this.store(this.regA, this.addrAbsolute()) },
      [0x9D]: { instruction: 'STA', callable: () => this.store(this.regA, this.addrAbsoluteX()) },
      [0x99]: { instruction: 'STA', callable: () => this.store(this.regA, this.addrAbsoluteY()) },
      [0x91]: { instruction: 'STA', callable: () => this.store(this.regA, this.addrIndirectY()) },

      // STX
      [0x86]: { instruction: 'STX', callable: () => this.store(this.regX, this.addrZeroPage()) },
      [0x8E]: { instruction: 'STX', callable: () => this.store(this.regX, this.addrAbsolute()) },

      // LDX
      [0xA2]: { instruction: 'LDX', callable: () => this.regX = this.addrImmediate() },
      [0xA6]: { instruction: 'LDX', callable: () => this.regX = this.readUint8AtAddress(this.addrZeroPage()) },
      [0xB6]: { instruction: 'LDX', callable: () => this.regX = this.readUint8AtAddress(this.addrZeroPageY()) },
      [0xAE]: { instruction: 'LDX', callable: () => this.regX = this.readUint8AtAddress(this.addrAbsolute()) },
      [0xBE]: { instruction: 'LDX', callable: () => this.regX = this.readUint8AtAddress(this.addrAbsoluteY()) },

      // AND
      [0x29]: { instruction: 'AND', callable: () => this.and(this.addrImmediate()) },
      [0x25]: { instruction: 'AND', callable: () => this.and(this.addrZeroPage()) },
      [0x35]: { instruction: 'AND', callable: () => this.and(this.addrZeroPageX()) },
      [0x2D]: { instruction: 'AND', callable: () => this.and(this.addrAbsolute()) },
      [0x3D]: { instruction: 'AND', callable: () => this.and(this.addrAbsoluteX()) },
      [0x39]: { instruction: 'AND', callable: () => this.and(this.addrAbsoluteY()) },
      [0x21]: { instruction: 'AND', callable: () => this.and(this.addrIndirectX()) },
      [0x31]: { instruction: 'AND', callable: () => this.and(this.addrIndirectY()) },

      // ORA
      [0x09]: { instruction: 'ORA', callable: () => this.ora(this.addrImmediate()) },
      [0x05]: { instruction: 'ORA', callable: () => this.ora(this.addrZeroPage()) },
      [0x15]: { instruction: 'ORA', callable: () => this.ora(this.addrZeroPageX()) },
      [0x0D]: { instruction: 'ORA', callable: () => this.ora(this.addrAbsolute()) },
      [0x1D]: { instruction: 'ORA', callable: () => this.ora(this.addrAbsoluteX()) },
      [0x19]: { instruction: 'ORA', callable: () => this.ora(this.addrAbsoluteY()) },
      [0x11]: { instruction: 'ORA', callable: () => this.ora(this.addrIndirectY()) },

      // EOR
      [0x49]: { instruction: 'EOR', callable: () => this.eor(this.addrImmediate()) },
      [0x45]: { instruction: 'EOR', callable: () => this.eor(this.addrZeroPage()) },
      [0x55]: { instruction: 'EOR', callable: () => this.eor(this.addrZeroPageX()) },
      [0x4D]: { instruction: 'EOR', callable: () => this.eor(this.addrAbsolute()) },
      [0x5D]: { instruction: 'EOR', callable: () => this.eor(this.addrAbsoluteX()) },
      [0x59]: { instruction: 'EOR', callable: () => this.eor(this.addrAbsoluteY()) },
      [0x41]: { instruction: 'EOR', callable: () => this.eor(this.addrIndirectX()) },
      [0x51]: { instruction: 'EOR', callable: () => this.eor(this.addrIndirectY()) },

      // Register operations
      [0x9A]: { instruction: 'TXS', callable: () => this.regSP = this.regX },
      [0x8A]: { instruction: 'TXA', callable: () => this.regA = this.regX },
      [0xAA]: { instruction: 'TAX', callable: () => this.regX = this.regA },
      [0x48]: { instruction: 'PHA', callable: () => this.pushValue(this.regA) },
      [0x68]: { instruction: 'PLA', callable: () => this.regA = this.popValue() },

      // BIT
      [0x24]: { instruction: 'BIT', callable: () => this.bit(this.addrZeroPage()) },
      [0x2C]: { instruction: 'BIT', callable: () => this.bit(this.addrAbsolute()) },

      // Arithmetic
      // DEY
      [0x88]: { instruction: 'DEY', callable: () => this.regY = this.mathWithStatus(this.regY, -1) },
      // INY
      [0xC8]: { instruction: 'INY', callable: () => this.regY = this.mathWithStatus(this.regY, 1) },
      // DEX
      [0xCA]: { instruction: 'DEX', callable: () => this.regX = this.mathWithStatus(this.regX, -1) },
      [0xE8]: { instruction: 'INX', callable: () => this.regX = this.mathWithStatus(this.regX, 1) },
      // INC
      [0xE6]: { instruction: 'INC', callable: () => this.inc(this.addrZeroPage()) },
      [0xF6]: { instruction: 'INC', callable: () => this.inc(this.addrZeroPageX()) },
      [0xEE]: { instruction: 'INC', callable: () => this.inc(this.addrAbsolute()) },
      [0xFE]: { instruction: 'INC', callable: () => this.inc(this.addrAbsoluteX()) },
      // LSR
      [0x4A]: { instruction: 'LSR', callable: () => this.regA = this.lsr(this.regA) },
      // ROL
      [0x2A]: { instruction: 'ROL', callable: () => this.regA = this.rol(this.regA) },
      [0x26]: { instruction: 'ROL', callable: () => this.ramOp(this.addrZeroPage(), this.rol) },
      [0x36]: { instruction: 'ROL', callable: () => this.ramOp(this.addrZeroPageX(), this.rol) },
      [0x2E]: { instruction: 'ROL', callable: () => this.ramOp(this.addrAbsolute(), this.rol) },
      [0x3E]: { instruction: 'ROL', callable: () => this.ramOp(this.addrAbsoluteX(), this.rol) },
      // ROR
      [0x6A]: { instruction: 'ROR', callable: () => this.regA = this.ror(this.regA) },
      [0x66]: { instruction: 'ROR', callable: () => this.ramOp(this.addrZeroPage(), this.ror) },
      [0x76]: { instruction: 'ROR', callable: () => this.ramOp(this.addrZeroPageX(), this.ror) },
      [0x6E]: { instruction: 'ROR', callable: () => this.ramOp(this.addrAbsolute(), this.ror) },
      [0x7E]: { instruction: 'ROR', callable: () => this.ramOp(this.addrAbsoluteX(), this.ror) },
      // ADC
      [0x69]: { instruction: 'ADC', callable: () => this.adc(this.addrImmediate()) },
      [0x65]: { instruction: 'ADC', callable: () => this.adc(this.addrZeroPage()) },
      [0x75]: { instruction: 'ADC', callable: () => this.adc(this.addrZeroPageX()) },
      [0x6D]: { instruction: 'ADC', callable: () => this.adc(this.addrAbsolute()) },
      [0x7D]: { instruction: 'ADC', callable: () => this.adc(this.addrAbsoluteX()) },
      [0x79]: { instruction: 'ADC', callable: () => this.adc(this.addrAbsoluteY()) },
      [0x61]: { instruction: 'ADC', callable: () => this.adc(this.addrIndirectX()) },
      [0x71]: { instruction: 'ADC', callable: () => this.adc(this.addrIndirectY()) },
      // SBC
      [0xE9]: { instruction: 'SBC', callable: () => this.sbc(this.addrImmediate()) },
      [0xE5]: { instruction: 'SBC', callable: () => this.sbc(this.addrZeroPage()) },
      [0xF5]: { instruction: 'SBC', callable: () => this.sbc(this.addrZeroPageX()) },
      [0xED]: { instruction: 'SBC', callable: () => this.sbc(this.addrAbsolute()) },
      [0xFD]: { instruction: 'SBC', callable: () => this.sbc(this.addrAbsoluteX()) },
      [0xF9]: { instruction: 'SBC', callable: () => this.sbc(this.addrAbsoluteY()) },
      [0xE1]: { instruction: 'SBC', callable: () => this.sbc(this.addrIndirectX()) },
      [0xF1]: { instruction: 'SBC', callable: () => this.sbc(this.addrIndirectY()) },

      // Branch instructions
      [0x10]: { instruction: 'BPL', callable: () => this.branch((this.regSW & SW_FLAG_NEGATIVE_MASK) === 0) },
      [0xD0]: { instruction: 'BNE', callable: () => this.branch((this.regSW & SW_FLAG_ZERO_MASK) === 0) },
      [0xB0]: { instruction: 'BCS', callable: () => this.branch(!!(this.regSW & SW_FLAG_CARRY_MASK)) },
      [0xF0]: { instruction: 'BEQ', callable: () => this.branch(!!(this.regSW & SW_FLAG_ZERO_MASK)) },
      [0x90]: { instruction: 'BCC', callable: () => this.branch(!!(this.regSW & SW_FLAG_CARRY_MASK)) },

      // JMP
      [0x4C]: { instruction: 'JMP', callable: () => this.regPC = this.addrAbsolute() },
      [0x6C]: {
        instruction: 'JMP',
        callable: () => this.regPC = this.readUint16AtAddress(this.readUint16()),
      },
      // JSR
      [0x20]: { instruction: 'JSR', callable: () => this.jsr() },
      // RTS
      [0x60]: { instruction: 'RTS', callable: () => this.rts() },
      [0x40]: { instruction: 'RTI', callable: () => this.rti() },

      // Compare instructions
      // CMP
      [0xC9]: { instruction: 'CMP', callable: () => this.compare(this.regA, this.addrImmediate()) },
      [0xC5]: { instruction: 'CMP', callable: () => this.compare(this.regA, this.readUint8AtAddress(this.addrZeroPage())) },
      [0xCD]: { instruction: 'CMP', callable: () => this.compare(this.regA, this.readUint8AtAddress(this.addrAbsolute())) },
      [0xDD]: { instruction: 'CMP', callable: () => this.compare(this.regA, this.readUint8AtAddress(this.addrAbsoluteX())) },
      [0xD9]: { instruction: 'CMP', callable: () => this.compare(this.regA, this.readUint8AtAddress(this.addrAbsoluteY())) },

      // CPX
      [0xE0]: { instruction: 'CPX', callable: () => this.compare(this.regX, this.addrImmediate()) },
      [0xE4]: { instruction: 'CPX', callable: () => this.compare(this.regX, this.readUint8AtAddress(this.addrZeroPage())) },
      [0xEC]: { instruction: 'CPX', callable: () => this.compare(this.regX, this.readUint8AtAddress(this.addrAbsolute())) },

      // CPY
      [0xC0]: { instruction: 'CPY', callable: () => this.compare(this.regY, this.addrImmediate()) },
      [0xC4]: { instruction: 'CPY', callable: () => this.compare(this.regY, this.readUint8AtAddress(this.addrZeroPage())) },
      [0xCC]: { instruction: 'CPY', callable: () => this.compare(this.regY, this.readUint8AtAddress(this.addrAbsolute())) },
    };
  }

  reset() {
    const vector = this.readUint16AtAddress(RESET_VECTOR_ADDR);
    console.log('reset vector:', vector.toString(16));
    this.setAddr(vector);

    // reset the registers
    this.regSP = 0xff;
    this.regA = 0;
    this.regX = 0;
    this.regY = 0;
    this.regSW = SW_DEFAULT;
  }

  nmi() {
    const vector = this.readUint16AtAddress(NMI_VECTOR_ADDR);
    this.pushAddr(this.regPC);
    this.pushValue(this.regSW);
    this.regPC = vector;
  }

  clock() {
    // don't do anything until the current instructio is "being completed"
    if (this.instructionCounter > 0) {
      this.instructionCounter--;
      return;
    }

    // fetch the next opcode
    const opcode = this.readUint8();

    const opCode = this.opCodeMap[opcode];
    if (opCode) {
      console.log((this.regPC - 1).toString(16), opCode.instruction);
      opCode.callable();
    } else {
      console.log('unknown opcode: ', (this.regPC - 1).toString(16), opcode.toString(16));
    }
  }

  // utility methods

  private setAddr(address: number) {
    this.regPC = address & MAX_ADDRESS;
    this.bus.setAddr(address);
  }

  private readUint8(): number {
    this.instructionCounter++;
    this.bus.setBusDirection('read');
    this.bus.setAddr((this.regPC++) & MAX_ADDRESS);
    const value = this.bus.getBusValue();
    return value;
  }

  private readUint16() {
    const lowByte = this.readUint8();
    const highByte = this.readUint8();
    return (highByte << 8) | lowByte;
  }

  private toInt8(value: number) {
    const byte = (value >>> 0) & MAX_BYTE;
    return byte >= 0x80 ? byte - 0x100 : byte;
  }

  private setFlag(flag: ProcessorFlag, set: boolean) {
    const bit = set ? 1 : 0;
    this.regSW |= bit << flag;
  }

  private getFlag(flag: ProcessorFlag): number {
    const mask = 1 << flag;
    return (this.regSW & mask) ? 1 : 0;
  }

  // memory routines
  private readUint8AtAddress(address: number): number {
    this.instructionCounter++;
    this.bus.setBusDirection('read');
    this.bus.setAddr(address);
    return this.bus.getBusValue();
  }

  private readUint16AtAddress(address: number): number {
    const lowByte = this.readUint8AtAddress(address & MAX_ADDRESS);
    const highByte = this.readUint8AtAddress((address + 1) & MAX_ADDRESS)
    return (highByte << 8) | lowByte;
  }

  private write(address: number, value: number) {
    this.bus.setBusDirection('write');
    this.bus.setAddr(address);
    this.bus.setBusValue(value);
  }

  private twosComplement(value: number): number {
    return (~value + 1) & MAX_BYTE;
  }

  /******************************
   *      ADDRESSING MODES      *
   *****************************/

  private addrImmediate() {
    return this.readUint8();
  }

  private addrZeroPage() {
    return this.readUint8();
  }

  private addrZeroPageX() {
    this.instructionCounter++;
    return (this.readUint8() + this.regX) & MAX_BYTE;
  }

  private addrZeroPageY() {
    this.instructionCounter++;
    return (this.readUint8() + this.regY) & MAX_BYTE;
  }

  private addrAbsolute() {
    return this.readUint16();
  }

  private addrAbsoluteX() {
    const absoluteAddr = this.addrAbsolute();
    return (absoluteAddr + this.regX) & MAX_ADDRESS;
  }

  private addrAbsoluteY() {
    const absoluteAddr = this.addrAbsolute();
    return (absoluteAddr + this.regY) & MAX_ADDRESS;
  }

  private addrIndirectX() {
    const targetAddr = (this.readUint8() + this.regX) & MAX_BYTE;
    return this.readUint16AtAddress(targetAddr);
  }

  private addrIndirectY() {
    const zeroPageAddr = this.readUint8();
    const address = this.readUint16AtAddress(zeroPageAddr);
    return (address + this.regY) & MAX_ADDRESS;
  }

  private setRegisterFlags(value) {
    this.setFlag(SW_FLAG_NEGATIVE_BIT, !!(value & 0x80));
    this.setFlag(SW_FLAG_ZERO_BIT, !value);
  }

  // instructions

  private store(register: number, address: number) {
    this.instructionCounter++;
    this.bus.setAddr(address);
    this.bus.setBusDirection('write');
    this.bus.setBusValue(this.regA);
  }

  private and(addr: number) {
    const value = this.readUint8AtAddress(addr);
    this.regA = this.regA & value;
  }

  private ora(addr: number) {
    const value = this.readUint8AtAddress(addr);
    this.instructionCounter++;
    this.regA = this.regA | value;
  }

  private bit(value: number) {
    this.instructionCounter++;
    const result = this.regA & value;
    this.setRegisterFlags(value);
    this.regSW = (this.regSW & 0b00111111) | (result & 0b11000000);
  }

  private inc(addr: number) {
    let value = this.readUint8AtAddress(addr);
    this.write(addr, this.mathWithStatus(value, 1));
  }

  private lsr(originalValue: number, shiftPlaces: number = 1) {
    this.setFlag(SW_FLAG_CARRY_BIT, !!(originalValue & 1));
    return originalValue >> shiftPlaces;
  }

  private rol(originalValue: number): number {
    const bitSeven = originalValue >> 7;
    this.setFlag(SW_FLAG_CARRY_BIT, !!bitSeven);
    const value = (originalValue << 1) | bitSeven;
    this.setRegisterFlags(value);
    return value;
  }

  private ror(originalValue: number): number {
    const bitZero = originalValue & 1;
    this.setFlag(SW_FLAG_CARRY_BIT, !!bitZero);
    const value = (originalValue >> 1) | (bitZero << 7);
    this.setRegisterFlags(value);
    return value;
  }

  private ramOp(addr: number, operation: Function) {
    const value = this.readUint8AtAddress(addr);
    this.write(addr, operation(value));
  }

  private eor(addr: number) {
    const value = this.readUint8AtAddress(addr);
    this.regA = (this.regA ^ value) & MAX_BYTE;
  }

  private addWithCarry(value: number, carryBit: number) {
    const result = this.regA + value + carryBit;
    this.setFlag(SW_FLAG_CARRY_BIT, result > MAX_BYTE);
    this.regA = result & MAX_BYTE;
  }

  private adc(addr: number) {
    const value = this.readUint8AtAddress(addr);
    this.addWithCarry(value, this.getFlag(SW_FLAG_CARRY_BIT));
  }

  private sbc(addr: number) {
    const value = this.readUint8AtAddress(addr);
    this.addWithCarry(
      this.twosComplement(value),
      ~(this.getFlag(SW_FLAG_CARRY_BIT)) & 1
    );
  }

  private branch(shouldBranch: boolean) {
    const offset = this.readUint8();
    if (shouldBranch) {
      this.instructionCounter++;
      this.regPC = this.regPC + this.toInt8(offset);
    }
  }

  private compare(register: number, value: number) {
    const diff = this.toInt8(register - value);
    this.setRegisterFlags(diff);
    this.setFlag(
      SW_FLAG_CARRY_BIT,
      !!(this.regSP & SW_FLAG_NEGATIVE_MASK || this.regSP & SW_FLAG_ZERO_MASK)
    );
  }

  private pushValue(value: number) {
    this.instructionCounter++;
    this.write(this.regSP, value);
    this.regSP--;
    if (this.regSP < 0) {
      this.regSP = MAX_BYTE;
    }
  }

  private pushAddr(addr: number) {
    this.pushValue(addr >> 8);
    this.pushValue(addr & MAX_BYTE);
  }

  private popValue(): number {
    this.instructionCounter++;
    this.regSP = (this.regSP + 1) & MAX_BYTE;
    const value = this.readUint8AtAddress(this.regSP);
    return value;
  }

  private popAddr(): number {
    return this.popValue() | (this.popValue() << 8);
  }

  private jsr() {
    this.instructionCounter +- 3;
    const targetAddr = this.readUint16();
    const stashedAddr = this.regPC - 1;
    this.pushAddr(stashedAddr);
    this.regPC = targetAddr;
  }

  private rts() {
    this.instructionCounter +- 3;
    const address = this.popAddr();
    this.regPC = (address + 1) & MAX_ADDRESS;
  }

  private rti() {
    this.regSW = this.popValue();
    this.regPC = this.popAddr();
  }

  private mathWithStatus(valueA: number, valueB: number, overflow: boolean = false) {
    this.instructionCounter++;
    let result = valueA + valueB;
    if (result > MAX_BYTE && overflow) {
      this.setFlag(SW_FLAG_OVERFLOW_BIT, true);
    } else if (result < 0) {
      result += MAX_BYTE + 1;
    }
    result &= MAX_BYTE;
    this.setRegisterFlags(result);
    return result;
  }

}
