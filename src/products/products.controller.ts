import { Controller, Get } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductView } from './dto/product.view';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async listProducts(): Promise<ProductView[]> {
    return this.productsService.list();
  }
}
