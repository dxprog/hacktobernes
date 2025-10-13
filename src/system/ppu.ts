import { Chip } from '../common/chip';
import { Bus } from './bus';

const REGISTER_ADDRESS_MASK = 0x7;
const REGISTER_ADDRESS_PPUCTL = 0x2;
const HORIZONTAL_SCAN_COUNT = 341;
const VERTICAL_SCAN_COUNT = 262;

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
  private frameCounter: number;
  private regPpuStatus: number;
  private nmiCallback: Function;
  private ppuBus: Bus;

  constructor(nmiCallback: Function, ppuBus: Bus, parentEl: HTMLElement) {
    super();
    this.horizontalCounter = 0;
    this.verticalCounter = 0;
    this.frameCounter = 0;
    this.regPpuStatus = 0;
    this.nmiCallback = nmiCallback;
    this.ppuBus = ppuBus;
    this.ppuBus.setBusDirection('read');

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
    const tileAddr = (tileId * 16) + y;
    this.ppuBus.setAddr(tileAddr);
    const bitPlane0 = this.ppuBus.getBusValue();
    this.ppuBus.setAddr(tileAddr + 8);
    const bitPlane1 = this.ppuBus.getBusValue();
    const xShift = 7 - x;
    return ((bitPlane0 >> xShift) & 1) | (((bitPlane1 >> xShift) & 1) << 1);
  }

  clock() {
    const tile = this.horizontalCounter >> 3;
    const value = this.getValueForTile(tile, this.horizontalCounter & 0b111, this.verticalCounter & 0b111);
    const color = PALLETTE[value];
    this.setPixel(this.horizontalCounter, this.verticalCounter, color.r, color.g, color.b);
    this.horizontalCounter++;
    if (this.horizontalCounter >= HORIZONTAL_SCAN_COUNT) {
      this.verticalCounter++;
      this.horizontalCounter = 0;

      if (this.verticalCounter >= VERTICAL_SCAN_COUNT) {
        this.regPpuStatus |= PPUCTL_FLAG_VBLANK;
        console.log('vblank', this.regPpuStatus);
        this.context.putImageData(this.imageData, 0, 0);
        this.nmiCallback();
        this.verticalCounter = 0;
        this.frameCounter++;
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
