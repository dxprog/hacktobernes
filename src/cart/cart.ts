import { Chip } from "../common/chip";
import { Rom } from "../common/rom";

const HEADER_IDENT = 0x4e45531a;
const HEADER_SIZE = 16;
const ONE_K = 1024;
const PRG_BANK_SIZE = ONE_K * 16;
const CHR_BANK_SIZE = ONE_K * 8;
// for any bus address that rolls in, we only care about the lower fifteen bits...
const PRG_ADDRESS_MASK = 0x7fff;
const CHR_ADDRESS_MASK = 0x1fff;

export enum MirroringDirection {
  Horizontal = 0,
  Vertical = 1
};

export class Cart {
  public prgRom: Rom;
  public chrRom: Rom;
  public numPrgBanks: number;
  public numChrBanks: number;
  public mirroringType: MirroringDirection;
  public hasSram: boolean;
  public mapperId: number;

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
    this.prgRom = new Rom(
      new Uint8Array(data.subarray(HEADER_SIZE, HEADER_SIZE + prgDataSize)),
      PRG_ADDRESS_MASK
    );
    this.chrRom = new Rom(
      new Uint8Array(data.subarray(HEADER_SIZE + prgDataSize, HEADER_SIZE + prgDataSize + chrDataSize)),
      CHR_ADDRESS_MASK
    );
  }
}
