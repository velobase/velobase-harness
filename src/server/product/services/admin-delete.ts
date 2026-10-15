import {
  productCatalog,
  productOperation,
} from "@/server/product/catalog";
export async function adminDeleteProduct(productId: string) {
  return productOperation(() => productCatalog.archive(productId));
}
