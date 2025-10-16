import { MAX_ADDRESS, MAX_BYTE } from '../common/constants';
import { Bus } from './bus';
import { DmaController } from './DmaController';

const NMI_VECTOR_ADDR = 0xfffa;
const RESET_VECTOR_ADDR = 0xfffc;
const IRQ_VECTOR_ADDR = 0xfffe;
const STACK_STARTING_ADDR = 0x100;

// Internal functionaliy memory locations
const CPU_INTERNAL_ADDRESS_MASK = 0x4000;
const CPU_INTERNAL_OAMDMA_REGISTER = 0x4014;
const OAMDMA_DATA_LOCATION = 0x2004;
const OAMDMA_DATA_LENGTH = 0x100;

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
  private oamDmaController: DmaController;
  private _addrDbg: string;
  private halted: boolean;
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
  private internalRegisterMethods: Record<number, Function>;

  private instructionCounter: number = 0;

  constructor(bus: Bus) {
    this.bus = bus;
    this.oamDmaController = new DmaController(bus);

    this.buildOpCodeMap();
    this.buildRegisterMethodMap();

    this.ror = this.ror.bind(this);
    this.rol = this.rol.bind(this);
    this.lsr = this.lsr.bind(this);
    this.asl = this.asl.bind(this);

    this.halted = false;
  }

  buildOpCodeMap() {
    this.opCodeMap = {
      [0x78]: { instruction: 'SEI', callable: () => this.setFlag(SW_FLAG_INT_DISABLE, true) },
      [0xD8]: { instruction: 'CLD', callable: () => this.setFlag(SW_FLAG_BCD_ENABLE, false) },
      [0x38]: { instruction: 'SEC', callable: () => this.setFlag(SW_FLAG_CARRY_BIT, true) },
      [0x18]: { instruction: 'CLC', callable: () => this.setFlag(SW_FLAG_CARRY_BIT, false)},

      // LDA
      [0xA9]: { instruction: 'LDA', callable: () => this.regA = this.readImmediate() },
      [0xA5]: { instruction: 'LDA', callable: () => this.regA = this.readZeroPage() },
      [0xAD]: { instruction: 'LDA', callable: () => this.regA = this.readAbsolute() },
      [0xBD]: { instruction: 'LDA', callable: () => this.regA = this.readAbsoluteX() },
      [0xB9]: { instruction: 'LDA', callable: () => this.regA = this.readAbsoluteY() },
      [0xA1]: { instruction: 'LDA', callable: () => this.regA = this.readIndirectX() },
      [0xB1]: { instruction: 'LDA', callable: () => this.regA = this.readIndirectY() },

      // LDY
      [0xA0]: { instruction: 'LDY', callable: () => this.regY = this.readImmediate() },
      [0xA4]: { instruction: 'LDY', callable: () => this.regY = this.readZeroPage() },
      [0xB4]: { instruction: 'LDY', callable: () => this.regY = this.readZeroPageX() },
      [0xAC]: { instruction: 'LDY', callable: () => this.regY = this.readAbsolute() },
      [0xBC]: { instruction: 'LDY', callable: () => this.regY = this.readAbsoluteX() },

      // STA
      [0x85]: { instruction: 'STA', callable: () => this.write(this.addrZeroPage(), this.regA) },
      [0x95]: { instruction: 'STA', callable: () => this.write(this.addrZeroPageX(), this.regA) },
      [0x8D]: { instruction: 'STA', callable: () => this.write(this.addrAbsolute(), this.regA) },
      [0x9D]: { instruction: 'STA', callable: () => this.write(this.addrAbsoluteX(), this.regA) },
      [0x99]: { instruction: 'STA', callable: () => this.write(this.addrAbsoluteY(), this.regA) },
      [0x91]: { instruction: 'STA', callable: () => this.write(this.addrIndirectY(), this.regA) },

      // STX
      [0x86]: { instruction: 'STX', callable: () => this.write(this.addrZeroPage(), this.regX) },
      [0x96]: { instruction: 'STX', callable: () => this.write(this.addrZeroPageY(), this.regX) },
      [0x8E]: { instruction: 'STX', callable: () => this.write(this.addrAbsolute(), this.regX) },
      // STY
      [0x84]: { instruction: 'STY', callable: () => this.write(this.addrZeroPage(), this.regY) },
      [0x94]: { instruction: 'STY', callable: () => this.write(this.addrZeroPageX(), this.regY) },
      [0x8C]: { instruction: 'STY', callable: () => this.write(this.addrAbsolute(), this.regY) },

      // LDX
      [0xA2]: { instruction: 'LDX', callable: () => this.regX = this.readImmediate() },
      [0xA6]: { instruction: 'LDX', callable: () => this.regX = this.readZeroPage() },
      [0xB6]: { instruction: 'LDX', callable: () => this.regX = this.readZeroPageY() },
      [0xAE]: { instruction: 'LDX', callable: () => this.regX = this.readAbsolute() },
      [0xBE]: { instruction: 'LDX', callable: () => this.regX = this.readAbsoluteY() },

      // AND
      [0x29]: { instruction: 'AND', callable: () => this.and(this.readImmediate()) },
      [0x25]: { instruction: 'AND', callable: () => this.and(this.readZeroPage()) },
      [0x35]: { instruction: 'AND', callable: () => this.and(this.readZeroPageX()) },
      [0x2D]: { instruction: 'AND', callable: () => this.and(this.readAbsolute()) },
      [0x3D]: { instruction: 'AND', callable: () => this.and(this.readAbsoluteX()) },
      [0x39]: { instruction: 'AND', callable: () => this.and(this.readAbsoluteY()) },
      [0x21]: { instruction: 'AND', callable: () => this.and(this.readIndirectX()) },
      [0x31]: { instruction: 'AND', callable: () => this.and(this.readIndirectY()) },

      // ORA
      [0x09]: { instruction: 'ORA', callable: () => this.ora(this.readImmediate()) },
      [0x05]: { instruction: 'ORA', callable: () => this.ora(this.readZeroPage()) },
      [0x15]: { instruction: 'ORA', callable: () => this.ora(this.readZeroPageX()) },
      [0x0D]: { instruction: 'ORA', callable: () => this.ora(this.readAbsolute()) },
      [0x1D]: { instruction: 'ORA', callable: () => this.ora(this.readAbsoluteX()) },
      [0x19]: { instruction: 'ORA', callable: () => this.ora(this.readAbsoluteY()) },
      [0x11]: { instruction: 'ORA', callable: () => this.ora(this.readIndirectY()) },

      // EOR
      [0x49]: { instruction: 'EOR', callable: () => this.eor(this.readImmediate()) },
      [0x45]: { instruction: 'EOR', callable: () => this.eor(this.readZeroPage()) },
      [0x55]: { instruction: 'EOR', callable: () => this.eor(this.readZeroPageX()) },
      [0x4D]: { instruction: 'EOR', callable: () => this.eor(this.readAbsolute()) },
      [0x5D]: { instruction: 'EOR', callable: () => this.eor(this.readAbsoluteX()) },
      [0x59]: { instruction: 'EOR', callable: () => this.eor(this.readAbsoluteY()) },
      [0x41]: { instruction: 'EOR', callable: () => this.eor(this.readIndirectX()) },
      [0x51]: { instruction: 'EOR', callable: () => this.eor(this.readIndirectY()) },

      // Register operations
      [0x9A]: { instruction: 'TXS', callable: () => this.regSP = this.regX },
      [0x8A]: { instruction: 'TXA', callable: () => this.regA = this.regX },
      [0x98]: { instruction: 'TYA', callable: () => this.regA = this.regY },
      [0xAA]: { instruction: 'TAX', callable: () => this.regX = this.regA },
      [0xA8]: { instruction: 'TAX', callable: () => this.regY = this.regA },
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
      // DEC
      [0xC6]: { instruction: 'DEC', callable: () => this.dec(this.addrZeroPage()) },
      [0xD6]: { instruction: 'DEC', callable: () => this.dec(this.addrZeroPageX()) },
      [0xCE]: { instruction: 'DEC', callable: () => this.dec(this.addrAbsolute()) },
      [0xDE]: { instruction: 'DEC', callable: () => this.dec(this.addrAbsoluteX()) },
      // LSR
      [0x4A]: { instruction: 'LSR', callable: () => this.regA = this.lsr(this.regA) },
      [0x46]: { instruction: 'LSR', callable: () => this.ramOp(this.addrZeroPage(), this.lsr) },
      [0x56]: { instruction: 'LSR', callable: () => this.ramOp(this.addrZeroPageX(), this.lsr) },
      [0x4E]: { instruction: 'LSR', callable: () => this.ramOp(this.addrAbsolute(), this.lsr) },
      [0x5E]: { instruction: 'LSR', callable: () => this.ramOp(this.addrAbsoluteX(), this.lsr) },
      // ASL
      [0x0A]: { instruction: 'ASL', callable: () => this.regA = this.asl(this.regA) },
      [0x06]: { instruction: 'ASL', callable: () => this.ramOp(this.addrZeroPage(), this.asl) },
      [0x16]: { instruction: 'ASL', callable: () => this.ramOp(this.addrZeroPageX(), this.asl) },
      [0x0E]: { instruction: 'ASL', callable: () => this.ramOp(this.addrAbsolute(), this.asl) },
      [0x1E]: { instruction: 'ASL', callable: () => this.ramOp(this.addrAbsoluteX(), this.asl) },
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
      [0x69]: { instruction: 'ADC', callable: () => this.adc(this.readImmediate()) },
      [0x65]: { instruction: 'ADC', callable: () => this.adc(this.readZeroPage()) },
      [0x75]: { instruction: 'ADC', callable: () => this.adc(this.readZeroPageX()) },
      [0x6D]: { instruction: 'ADC', callable: () => this.adc(this.readAbsolute()) },
      [0x7D]: { instruction: 'ADC', callable: () => this.adc(this.readAbsoluteX()) },
      [0x79]: { instruction: 'ADC', callable: () => this.adc(this.readAbsoluteY()) },
      [0x61]: { instruction: 'ADC', callable: () => this.adc(this.readIndirectX()) },
      [0x71]: { instruction: 'ADC', callable: () => this.adc(this.readIndirectY()) },
      // SBC
      [0xE9]: { instruction: 'SBC', callable: () => this.sbc(this.readImmediate()) },
      [0xE5]: { instruction: 'SBC', callable: () => this.sbc(this.readZeroPage()) },
      [0xF5]: { instruction: 'SBC', callable: () => this.sbc(this.readZeroPageX()) },
      [0xED]: { instruction: 'SBC', callable: () => this.sbc(this.readAbsolute()) },
      [0xFD]: { instruction: 'SBC', callable: () => this.sbc(this.readAbsoluteX()) },
      [0xF9]: { instruction: 'SBC', callable: () => this.sbc(this.readAbsoluteY()) },
      [0xE1]: { instruction: 'SBC', callable: () => this.sbc(this.readIndirectX()) },
      [0xF1]: { instruction: 'SBC', callable: () => this.sbc(this.readIndirectY()) },

      // Branch instructions
      [0x10]: { instruction: 'BPL', callable: () => this.branch(!(this.regSW & SW_FLAG_NEGATIVE_MASK)) },
      [0x30]: { instruction: 'BMI', callable: () => this.branch(!!(this.regSW & SW_FLAG_NEGATIVE_MASK)) },
      [0xD0]: { instruction: 'BNE', callable: () => this.branch(!(this.regSW & SW_FLAG_ZERO_MASK)) },
      [0xB0]: { instruction: 'BCS', callable: () => this.branch(!!(this.regSW & SW_FLAG_CARRY_MASK)) },
      [0xF0]: { instruction: 'BEQ', callable: () => this.branch(!!(this.regSW & SW_FLAG_ZERO_MASK)) },
      [0x90]: { instruction: 'BCC', callable: () => this.branch(!(this.regSW & SW_FLAG_CARRY_MASK)) },

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
      [0xC9]: { instruction: 'CMP', callable: () => this.compare(this.regA, this.readImmediate()) },
      [0xC5]: { instruction: 'CMP', callable: () => this.compare(this.regA, this.readUint8AtAddress(this.addrZeroPage())) },
      [0xCD]: { instruction: 'CMP', callable: () => this.compare(this.regA, this.readUint8AtAddress(this.addrAbsolute())) },
      [0xDD]: { instruction: 'CMP', callable: () => this.compare(this.regA, this.readUint8AtAddress(this.addrAbsoluteX())) },
      [0xD9]: { instruction: 'CMP', callable: () => this.compare(this.regA, this.readUint8AtAddress(this.addrAbsoluteY())) },

      // CPX
      [0xE0]: { instruction: 'CPX', callable: () => this.compare(this.regX, this.readImmediate()) },
      [0xE4]: { instruction: 'CPX', callable: () => this.compare(this.regX, this.readUint8AtAddress(this.addrZeroPage())) },
      [0xEC]: { instruction: 'CPX', callable: () => this.compare(this.regX, this.readUint8AtAddress(this.addrAbsolute())) },

      // CPY
      [0xC0]: { instruction: 'CPY', callable: () => this.compare(this.regY, this.readImmediate()) },
      [0xC4]: { instruction: 'CPY', callable: () => this.compare(this.regY, this.readUint8AtAddress(this.addrZeroPage())) },
      [0xCC]: { instruction: 'CPY', callable: () => this.compare(this.regY, this.readUint8AtAddress(this.addrAbsolute())) },
    };

    console.log(`Added ${Object.keys(this.opCodeMap).length} operations`);
  }

  buildRegisterMethodMap() {
    this.internalRegisterMethods = {
      [CPU_INTERNAL_OAMDMA_REGISTER]: value => this.startOamDmaTransfer(value),
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

  startOamDmaTransfer(startByteUpper: number) {
    this.oamDmaController.beginDmaTransfer(startByteUpper << 8, OAMDMA_DATA_LOCATION, OAMDMA_DATA_LENGTH);
  }

  clock(withDebug: boolean = false) {
    if (this.halted) {
      return;
    }

    // if there's an active DMA transfer in progress, the CPU is halted
    if (this.oamDmaController.clock()) {
      return;
    }

    // don't do anything until the current instructio is "being completed"
    if (this.instructionCounter > 0) {
      this.instructionCounter--;
      return;
    }

    // fetch the next opcode
    this._addrDbg = '';
    const opcode = this.readUint8();

    const opCode = this.opCodeMap[opcode];
    if (opCode) {
      opCode.callable();
      if (withDebug) {
        console.log(`$${(this.regPC - 1).toString(16)}: ${opCode.instruction} ${this._addrDbg}`);
      }
    } else {
      console.log('unknown opcode: ', (this.regPC - 1).toString(16), opcode.toString(16));
      this.halted = true;
    }
  }

  // utility methods

  private setAddr(address: number) {
    this.regPC = address & MAX_ADDRESS;
    this.bus.setAddr(address);
  }

  private readUint8(): number {
    this.instructionCounter++;
    return this.bus.readAddr((this.regPC++) & MAX_ADDRESS);;
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
    const mask = 1 << flag;
    this.regSW = set ? (this.regSW | mask) : (this.regSW & ~mask) & MAX_BYTE;
  }

  private getFlag(flag: ProcessorFlag): number {
    const mask = 1 << flag;
    return (this.regSW & mask) ? 1 : 0;
  }

  // memory routines
  private readUint8AtAddress(address: number): number {
    this.instructionCounter++;
    return this.bus.readAddr(address);
  }

  private readUint16AtAddress(address: number): number {
    const lowByte = this.readUint8AtAddress(address & MAX_ADDRESS);
    const highByte = this.readUint8AtAddress((address + 1) & MAX_ADDRESS)
    return (highByte << 8) | lowByte;
  }

  private write(address: number, value: number) {
    this.bus.writeAddr(address, value);

    // handle CPU special writes
    if (address & CPU_INTERNAL_ADDRESS_MASK) {
      if (this.internalRegisterMethods[address]) {
        this.internalRegisterMethods[address](value);
      } else {
        console.log('Unimplemented internal register function: ', address.toString(16));
      }
    }
  }

  private twosComplement(value: number): number {
    return (~value + 1) & MAX_BYTE;
  }

  /******************************
   *      ADDRESSING MODES      *
   *****************************/

  private readImmediate() {
    const value = this.readUint8();
    this._addrDbg = `#${value.toString(16)}`;
    return value;
  }

  private addrZeroPage() {
    const value = this.readUint8();
    this._addrDbg = `$${value.toString(16)}`;
    return value;
  }
  private readZeroPage() {
    return this.readUint8AtAddress(this.addrZeroPage());
  }

  private addrZeroPageX() {
    this.instructionCounter++;
    const value = this.readUint8();
    this._addrDbg = `$${value.toString(16)}, X`;
    return (value + this.regX) & MAX_BYTE;
  }
  private readZeroPageX() {
    return this.readUint8AtAddress(this.addrZeroPageX());
  }

  private addrZeroPageY() {
    this.instructionCounter++;
    const value = this.readUint8();
    this._addrDbg = `$${value.toString(16)}, Y`;
    return (value + this.regY) & MAX_BYTE;
  }
  private readZeroPageY() {
    return this.readUint8AtAddress(this.addrZeroPageY());
  }

  private addrAbsolute() {
    const value = this.readUint16();
    this._addrDbg = `$${value.toString(16)}`;
    return value;
  }
  private readAbsolute() {
    return this.readUint8AtAddress(this.addrAbsolute());
  }

  private addrAbsoluteX() {
    const absoluteAddr = this.addrAbsolute();
    this._addrDbg = `$${absoluteAddr.toString(16)}, X`;
    return (absoluteAddr + this.regX) & MAX_ADDRESS;
  }
  private readAbsoluteX() {
    return this.readUint8AtAddress(this.addrAbsoluteX());
  }

  private addrAbsoluteY() {
    const absoluteAddr = this.addrAbsolute();
    this._addrDbg = `$${absoluteAddr.toString(16)}, Y`;
    return (absoluteAddr + this.regY) & MAX_ADDRESS;
  }
  private readAbsoluteY() {
    return this.readUint8AtAddress(this.addrAbsoluteY());
  }

  private addrIndirectX() {
    const value = this.readUint8();
    this._addrDbg = `($${value.toString(16)}, X)`;
    const targetAddr = (value + this.regX) & MAX_BYTE;
    return this.readUint16AtAddress(targetAddr);
  }
  private readIndirectX() {
    return this.readUint8AtAddress(this.addrIndirectX());
  }

  private addrIndirectY() {
    const zeroPageAddr = this.readUint8();
    this._addrDbg = `($${zeroPageAddr.toString(16)}), Y`;
    const address = this.readUint16AtAddress(zeroPageAddr);
    return (address + this.regY) & MAX_ADDRESS;
  }
  private readIndirectY() {
    return this.readUint8AtAddress(this.addrIndirectY());
  }

  private setRegisterFlags(value) {
    this.setFlag(SW_FLAG_NEGATIVE_BIT, !!(value & 0b10000000));
    this.setFlag(SW_FLAG_ZERO_BIT, !value);
  }

  // instructions

  private and(value: number) {
    this.instructionCounter++;
    this.regA = this.regA & value;
  }

  private ora(value: number) {
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

  private dec(addr: number) {
    let value = this.readUint8AtAddress(addr);
    this.write(addr, this.mathWithStatus(value, -1));
  }

  private lsr(originalValue: number, shiftPlaces: number = 1) {
    this.setFlag(SW_FLAG_CARRY_BIT, !!(originalValue & 1));
    return originalValue >> shiftPlaces;
  }

  private asl(originalValue: number, shiftPlaces: number = 1) {
    this.setFlag(SW_FLAG_CARRY_BIT, !!(originalValue & 0x80));
    return originalValue << shiftPlaces;
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

  private eor(value: number) {
    this.regA = (this.regA ^ value) & MAX_BYTE;
  }

  private addWithCarry(value: number, carryBit: number) {
    const result = this.regA + value + carryBit;
    this.setFlag(SW_FLAG_CARRY_BIT, result > MAX_BYTE);
    this.regA = result & MAX_BYTE;
  }

  private adc(value: number) {
    this.addWithCarry(value, this.getFlag(SW_FLAG_CARRY_BIT));
  }

  private sbc(value: number) {
    this.addWithCarry(
      this.twosComplement(value),
      ~(this.getFlag(SW_FLAG_CARRY_BIT)) & 1
    );
  }

  private branch(shouldBranch: boolean) {
    // this is a hack to get the correct debugger output
    const offset = this.addrZeroPage();
    if (shouldBranch) {
      this.instructionCounter++;
      this.regPC = this.regPC + this.toInt8(offset);
    }
  }

  private compare(register: number, value: number) {
    const result = register - value;
    const diff = this.toInt8(result);
    this.setRegisterFlags(diff);
    this.setFlag(
      SW_FLAG_CARRY_BIT,
      result >= 0
    );
  }

  private pushValue(value: number) {
    this.instructionCounter++;
    this.write(STACK_STARTING_ADDR + this.regSP--, value);
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
    const retVal = this.readUint8AtAddress(STACK_STARTING_ADDR + this.regSP) & MAX_BYTE;
    return retVal;
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
    this.instructionCounter += 3;
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
