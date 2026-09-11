import {
  productCatalog,
  productOperation,
} from "@/modules/products/server/service";
export async function adminDeleteProduct(productId: string) {
  return productOperation(() => productCatalog.archive(productId));
}
