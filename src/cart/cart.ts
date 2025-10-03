import { Chip } from "../common/chip";

const HEADER_IDENT = 0x4e45531a;
const HEADER_SIZE = 16;
const ONE_K = 1024;
const PRG_BANK_SIZE = ONE_K * 16;
const CHR_BANK_SIZE = ONE_K * 8;
// for any bus address that rolls in, we only care about the lower fifteen bits
const ADDRESS_MASK = 0x7fff;

// reset vectors for the 6502 sit at the top of memory of the system
// memory map. the reset vector will be at the top of the first bank
// of PRG ROM. PRG ROM starts at 0x8000. therefore, all these addresses
// will be where the CPU would look minus 0x8000
const NMI_VECTOR_ADDR = 0x7ffa;
const RESET_VECTOR_ADDR = 0x7ffc;
const IRQ_VECTOR_ADDR = 0x7ffe;

export enum MirroringDirection {
  Horizontal = 0,
  Vertical = 1
};

export class Cart extends Chip {
  public prgData: Uint8Array;
  public chrData: Uint8Array;
  public numPrgBanks: number;
  public numChrBanks: number;
  public mirroringType: MirroringDirection;
  public hasSram: boolean;
  public mapperId: number;
  public nmiVector: number;
  public resetVector: number;
  public irqVector: number;

  async loadEncodedRom(encodedRomData: string) {
    try {
      const response = await fetch(encodedRomData);
      const buffer = await response.arrayBuffer();
      const data = new Uint8Array(buffer);
      this.readRomHeader(data);
    } catch (err) {
      console.error('There was an error reading the encoded data into the array buffer');
    }
  }

  readRomHeader(data: Uint8Array) {
    const dataView = new DataView(data.buffer);

    const id = dataView.getUint32(0);
    if (id !== HEADER_IDENT) {
      throw new Error('Invalid iNES File');
    }

    this.numPrgBanks = dataView.getUint8(4);
    const prgDataSize = this.numPrgBanks * PRG_BANK_SIZE;
    this.numChrBanks = dataView.getUint8(5);
    const chrDataSize = this.numChrBanks * CHR_BANK_SIZE;

    // verify that we have enough data
    if (
      HEADER_SIZE + prgDataSize + chrDataSize > data.length
    ) {
      throw new Error('File too small');
    }

    // flag 6
    let flag = dataView.getUint8(6);
    this.mirroringType = flag & 0b00000001;
    this.hasSram = (flag & 0b00000010) > 0;
    this.mapperId = (flag & 0b11110000) >> 4;

    // flag 7
    flag = dataView.getUint8(7);
    this.mapperId |= flag & 0b11110000;

    // duplicate all of the rom data so we can properly index into it
    this.prgData = new Uint8Array(data.subarray(HEADER_SIZE, HEADER_SIZE + prgDataSize));
    this.chrData = new Uint8Array(data.subarray(HEADER_SIZE + prgDataSize, HEADER_SIZE + prgDataSize + chrDataSize));

    // this will all move to the CPU when I have that, but it's useful for debugging right now
    const prgDataView = new DataView(this.prgData.buffer);
    this.resetVector = prgDataView.getUint16(RESET_VECTOR_ADDR, true);
    this.nmiVector = prgDataView.getUint16(NMI_VECTOR_ADDR, true);
    this.irqVector = prgDataView.getUint16(IRQ_VECTOR_ADDR, true);

    console.log('reset vector', this.resetVector.toString(16));
  }

  read(address: number): number {
    return this.prgData[address & ADDRESS_MASK];
  }

  write(address: number, value: number) {
    // you can't write to ROM... until I add mapper support
  }
}
