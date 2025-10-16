import { Chip } from '../common/chip';
import { MAX_BYTE } from '../common/constants';
import { Bus } from './bus';

const REGISTER_ADDRESS_MASK = 0x7;
const REGISTER_ADDRESS_PPUCTL = 0x2;
const HORIZONTAL_SCAN_COUNT = 341;
const VERTICAL_SCAN_COUNT = 262;
const OAM_RAM_SIZE = 0x100; // 256 bytes

// registers
const PPU_REG_COUNT = 8;
const PPU_REG_CTRL = 0;
const PPU_REG_MASK = 1;
const PPU_REG_STATUS = 2;
const PPU_REG_OAM_ADDR = 3;
const PPU_REG_OAM_DATA = 4;
const PPU_REG_SCROLL = 5;
const PPU_REG_ADDR = 6;
const PPU_REG_DATA = 7;

// PPUCTRL flags
const PPUCTL_FLAG_VBLANK = 0x80;

const PALLETTE = [
  { r: 255, g: 255, b: 255 },
  { r: 255, g: 0, b: 0 },
  { r: 0, g: 255, b: 0 },
  { r: 0, g: 0, b: 255 }
];

export class Ppu extends Chip {
  private parentEl: HTMLElement;
  private canvasEl: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private imageData: ImageData;
  private imageDataRaw: Uint8ClampedArray;

  private horizontalCounter: number;
  private verticalCounter: number;
  public frameCounter: number;
  private registers: Uint8Array;
  private regPpuStatus: number;
  private regW: number;
  private regV: number;
  private regT: number;
  private nmiCallback: Function;
  private ppuBus: Bus;
  private oamRam: Uint8Array;

  private get ramAddrInc(): number {
    return (this.registers[PPU_REG_CTRL] & 4) ? 32 : 1;
  }

  private get baseNametableAddr(): number {
    return ((this.registers[PPU_REG_CTRL] & 3) * 0x400) + 0x2000;
  }

  private get nmiEnabled(): boolean {
    return !!(this.registers[PPU_REG_CTRL] & 0x80);
  }

  private get backgroundRenderingEnabled(): boolean {
    return (this.registers[PPU_REG_MASK] & 0x8) > 0;
  }

  private get spriteRenderingEnabled(): boolean {
    return (this.registers[PPU_REG_MASK] & 0x10) > 0;
  }

  private get backgroundPatternTable(): number {
    return ((this.registers[PPU_REG_CTRL] >> 4) & 1) * 0x1000;
  }

  constructor(nmiCallback: Function, ppuBus: Bus, parentEl: HTMLElement) {
    super();
    this.horizontalCounter = 0;
    this.verticalCounter = 0;
    this.frameCounter = 0;
    this.regPpuStatus = 0;
    this.registers = (new Uint8Array(PPU_REG_COUNT)).fill(0);
    this.nmiCallback = nmiCallback;
    this.ppuBus = ppuBus;
    this.ppuBus.setBusDirection('read');
    this.oamRam = (new Uint8Array(OAM_RAM_SIZE)).fill(0);

    this.regV = 0;
    this.regT = 0;
    this.regW = 0;

    this.parentEl = parentEl;
    this.buildDOM();
  }

  buildDOM() {
    const canvas = document.createElement('canvas');
    canvas.width = HORIZONTAL_SCAN_COUNT;
    canvas.height = VERTICAL_SCAN_COUNT;
    this.canvasEl = canvas;
    const context = canvas.getContext('2d');
    this.parentEl.appendChild(canvas);
    // we'll use this to draw each and every pixel
    this.imageData = context.getImageData(0, 0, HORIZONTAL_SCAN_COUNT, VERTICAL_SCAN_COUNT);
    this.imageDataRaw = this.imageData.data;
    this.context = context;
  }

  setPixel(x: number, y: number, r: number, g: number, b: number) {
    const index = (y * HORIZONTAL_SCAN_COUNT + x) * 4;
    this.imageDataRaw[index] = r;
    this.imageDataRaw[index + 1] = g;
    this.imageDataRaw[index + 2] = b;
    this.imageDataRaw[index + 3] = 255;
  }

  getValueForTile(tileId: number, x: number, y: number): number {
    const tileAddr = (tileId * 16) + y + this.backgroundPatternTable;
    const bitPlane0 = this.ppuBus.readAddr(tileAddr);
    const bitPlane1 = this.ppuBus.readAddr(tileAddr + 8);
    const xShift = 7 - x;
    return ((bitPlane0 >> xShift) & 1) | (((bitPlane1 >> xShift) & 1) << 1);
  }

  clock() {
    if (!this.backgroundRenderingEnabled) {
      // console.log('background pls');
      const tileY = this.verticalCounter >> 3;
      const tileX = this.horizontalCounter >> 3;
      const tile = (tileY * 32) + tileX;
      const tileId = this.ppuBus.readAddr(this.baseNametableAddr + tile);
      const value = this.getValueForTile(tileId, this.horizontalCounter & 0b111, this.verticalCounter & 0b111);
      const color = PALLETTE[value];
      this.setPixel(this.horizontalCounter, this.verticalCounter, color.r, color.g, color.b);
    }

    this.horizontalCounter++;
    if (this.horizontalCounter >= HORIZONTAL_SCAN_COUNT) {
      this.verticalCounter++;
      this.horizontalCounter = 0;

      if (this.verticalCounter >= VERTICAL_SCAN_COUNT) {
        this.registers[PPU_REG_STATUS] |= PPUCTL_FLAG_VBLANK;
        this.context.putImageData(this.imageData, 0, 0);
        if (this.nmiEnabled) {
          console.log(`${this.frameCounter}: VBlank + NMI`);
          this.nmiCallback();
        } else {
          console.log(`${this.frameCounter}: VBlank`);
        }
        this.verticalCounter = 0;
        this.frameCounter++;
      }
    }

    if (this.horizontalCounter === 150 && this.verticalCounter === 30) {
      this.registers[PPU_REG_STATUS] &= 0x40;
    } else {
      this.registers[PPU_REG_STATUS] &= 0xBF;
    }
  }

  read(address: number): number {
    const registerAddress = address & REGISTER_ADDRESS_MASK;
    const registerValue = this.registers[registerAddress];
    // console.log(`PPU read, $200${registerAddress}`);

    // special cases for particular registers
    switch (registerAddress) {
      case PPU_REG_CTRL:
        this.registers[PPU_REG_STATUS] = (this.registers[PPU_REG_STATUS] & ~PPUCTL_FLAG_VBLANK) & 0xFF;
        break;
      case PPU_REG_STATUS:
        this.regW = 0;
        break;
      case PPU_REG_DATA:
        const data = this.ppuBus.readAddr(this.regT);
        this.regT += this.ramAddrInc;
        return data;
    }

    return registerValue;
  }

  write(address: number, value: number) {
    const registerAddress = address & REGISTER_ADDRESS_MASK;
    this.registers[registerAddress] = value;
    // console.log(`PPU write, $200${registerAddress}`, value.toString(2));

    switch (registerAddress) {
      case PPU_REG_CTRL:
        // console.log(`Control write, $200${registerAddress}`, value.toString(2));
        break;
      case PPU_REG_SCROLL:
        this.regW = (this.regW + 1) & 1;
        break;
      case PPU_REG_MASK:
        // console.log('Mask reg write: ', value.toString(2));
        break;
      case PPU_REG_OAM_ADDR:
        console.log('oam address', value.toString(16));
        break;
      case PPU_REG_OAM_DATA:
        this.oamRam[this.registers[PPU_REG_OAM_ADDR]] = value;
        this.registers[PPU_REG_OAM_ADDR] = (this.registers[PPU_REG_OAM_ADDR] + 1) & MAX_BYTE;
        console.log('writing OAM data: ', this.registers[PPU_REG_OAM_ADDR], ', ', value);
        break;
      case PPU_REG_ADDR:
        let ppuAddr = this.regT;
        if (this.regW) {
          ppuAddr = (ppuAddr & 0xff00) | value;
        } else {
          ppuAddr = (ppuAddr & 0xff) | ((value & 0b111111) << 8);
        }
        this.regT = ppuAddr;
        this.regW = (this.regW + 1) & 1;
        break;
      case PPU_REG_DATA:
        this.ppuBus.writeAddr(this.regT, value);
        this.regT += this.ramAddrInc;
        break;
    }
  }
};
