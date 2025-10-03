import { Cart } from "../cart/cart";
import { Bus } from "./bus";

// memory map masks
const CART_START_ADDRESS = 0x8000;

export class System {
  private bus: Bus;
  private cart: Cart;

  constructor(cart: Cart) {
    this.bus = new Bus();
    this.cart = cart;

    this.buildMemoryMap();
  }

  private buildMemoryMap() {
    // cart: 0x8000-0xFFFF
    this.bus.attachChip(CART_START_ADDRESS, this.cart);

    this.bus.setBusDirection('read');
    this.bus.setAddr(0xFFFC);
    console.log(this.bus.getBusValue());
    this.bus.setAddr(0xFFFD);
    console.log(this.bus.getBusValue());
  }
}
