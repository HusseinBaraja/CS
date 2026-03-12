import { describe, expect, test } from 'bun:test';
import { parseCreateProductBody, parseCreateProductImageUploadBody, parseUpdateProductBody } from './productSchemas';

describe("product schema parsers", () => {
  test("parseCreateProductBody trims unique specification keys", () => {
    const result = parseCreateProductBody({
      categoryId: "category-1",
      nameEn: "Burger Box",
      specifications: {
        " material ": "paper",
        recyclable: true,
      },
    });

    expect(result).toEqual({
      ok: true,
      value: {
        categoryId: "category-1",
        nameEn: "Burger Box",
        specifications: {
          material: "paper",
          recyclable: true,
        },
      },
    });
  });

  test("parseCreateProductBody rejects duplicate specification keys after trimming", () => {
    const result = parseCreateProductBody({
      categoryId: "category-1",
      nameEn: "Burger Box",
      specifications: {
        color: "red",
        " color ": "blue",
      },
    });

    expect(result).toEqual({
      ok: false,
      message: "specifications keys must be unique after trimming: color",
    });
  });

  test("parseUpdateProductBody rejects duplicate specification keys after trimming", () => {
    const result = parseUpdateProductBody({
      specifications: {
        size: "L",
        " size ": "XL",
      },
    });

    expect(result).toEqual({
      ok: false,
      message: "specifications keys must be unique after trimming: size",
    });
  });

  test("parseCreateProductImageUploadBody trims optional alt text", () => {
    const result = parseCreateProductImageUploadBody({
      contentType: " image/jpeg ",
      sizeBytes: 1024,
      alt: " Front view ",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        contentType: "image/jpeg",
        sizeBytes: 1024,
        alt: "Front view",
      },
    });
  });
});
