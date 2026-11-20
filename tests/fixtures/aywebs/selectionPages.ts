/**
 * Fixtures de pages marchandes pour le mode SÉLECTION (19/11/2026, P3-1).
 *
 * Copies figées des pages des tests SHEIN v2 / AliExpress v2 (états embarqués
 * réels + DOM sélectionné) et d'une fiche TEMU minimale avec choix coché.
 * Un test qui casse ici signale une dérive du lecteur, pas de la fixture.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export function buildSheinSpaPage(opts: {
  goodsId?: string;
  selectedSize?: string | null;
  displayedPrice?: string;
  currency?: string;
  activeColor?: string;
  addButtonLabel?: string;
  soldOutBanner?: string;
  canonicalHref?: string;
}): string {
  const goodsId = opts.goodsId ?? '382460229';
  const currency = opts.currency ?? 'EUR';
  const activeColor = opts.activeColor ?? 'Noir';
  const selectedSize = opts.selectedSize ?? null;
  const displayedPrice = opts.displayedPrice ?? (selectedSize === 'XL' ? '24,90 €' : '21,40 €');
  const addButtonLabel = opts.addButtonLabel ?? 'Ajouter au panier';

  const gbRawData = {
    currency,
    detail: {
      goods_id: goodsId,
      goods_sn: `sw261028${goodsId}`,
      goods_name: `Robe fleurie plissée ${activeColor}`,
      brand: { brand_name: 'DAZY' },
      is_on_sale: opts.soldOutBanner ? 0 : 1,
      original_img: `//img.ltwebstatic.com/images3_pi/2026/10/28/${goodsId}_main.jpg`,
      color_image: `//img.ltwebstatic.com/images3_pi/2026/10/28/${goodsId}_swatch.jpg`,
      mainSaleAttribute: [{ attr_value_name: activeColor }],
      salePrice: goodsId === '382460229'
        ? { amount: '21.40', currency, amountWithSymbol: '21,40 €' }
        : { amount: '23.90', currency, amountWithSymbol: '23,90 €' },
      retailPrice: { amount: '35.70', currency, amountWithSymbol: '35,70 €' },
    },
    goods_imgs: {
      main_image: { origin_image: `//img.ltwebstatic.com/images3_pi/2026/10/28/${goodsId}_main.jpg` },
      detail_image: [
        { origin_image: `//img.ltwebstatic.com/images3_pi/2026/10/28/${goodsId}_2.jpg` },
      ],
    },
    relation_color: goodsId === '382460229'
      ? [
          {
            goods_id: '400991122',
            mainSaleAttribute: [{ attr_value_name: 'Rouge' }],
            goods_color_image: '//img.ltwebstatic.com/images3_pi/2026/10/28/400991122_swatch.jpg',
            is_on_sale: 1,
            salePrice: { amount: '23.90', currency, amountWithSymbol: '23,90 €' },
          },
          {
            goods_id: '400991199',
            mainSaleAttribute: [{ attr_value_name: 'Vert Émeraude' }],
            goods_color_image: '//img.ltwebstatic.com/images3_pi/2026/10/28/400991199_swatch.jpg',
            is_on_sale: 0,
            salePrice: { amount: '21.40', currency, amountWithSymbol: '21,40 €' },
          },
        ]
      : [
          {
            goods_id: '382460229',
            mainSaleAttribute: [{ attr_value_name: 'Noir' }],
            goods_color_image: '//img.ltwebstatic.com/images3_pi/2026/10/28/382460229_swatch.jpg',
            is_on_sale: 1,
            salePrice: { amount: '21.40', currency, amountWithSymbol: '21,40 €' },
          },
        ],
    attrSizeList: goodsId === '382460229'
      ? [
          { attr_value_name: 'S', stock: 18, is_sold_out: false, price: { salePrice: { amount: '21.40', currency } } },
          { attr_value_name: 'M', stock: 3, is_sold_out: false, price: { salePrice: { amount: '21.40', currency } } },
          { attr_value_name: 'L', stock: 0, is_sold_out: true, price: { salePrice: { amount: '21.40', currency } } },
          { attr_value_name: 'XL', stock: 9, is_sold_out: false, price: { salePrice: { amount: '24.90', currency } } },
        ]
      : [
          { attr_value_name: 'S', stock: 12, is_sold_out: false, price: { salePrice: { amount: '23.90', currency } } },
          { attr_value_name: 'M', stock: 7, is_sold_out: false, price: { salePrice: { amount: '23.90', currency } } },
        ],
  };

  return `<!doctype html><html lang="fr"><head>
    <title>Robe fleurie plissée ${activeColor} | SHEIN</title>
    ${opts.canonicalHref ? `<link rel="canonical" href="${opts.canonicalHref}">` : ''}
    <meta property="product:price:amount" content="${goodsId === '382460229' ? '21.40' : '23.90'}">
    <meta property="product:price:currency" content="${currency}">
    <script>window.gbRawData = ${JSON.stringify(gbRawData)};</script>
  </head><body>
    <main class="goods-detailv2">
      <div class="product-intro">
        <h1 class="product-intro__head-name">Robe fleurie plissée ${activeColor}</h1>
        <div class="product-intro__brand-name">DAZY</div>
        <div class="product-intro__head-price">
          <span class="product-intro__head-mainprice">${displayedPrice}</span>
          <span class="product-intro__price-discount">-40%</span>
          <del class="product-intro__head-delprice">35,70 €</del>
          <div class="product-intro__club-price">SHEIN Club 19,99 €</div>
        </div>
        <div class="product-intro__color">
          <div class="product-intro__color-title">Couleur: ${activeColor}</div>
          <div class="product-intro__color-radio ${activeColor === 'Noir' ? 'product-intro__color-radio_active' : ''}" data-color-name="Noir" data-goods-id="382460229">
            <img src="//img.ltwebstatic.com/images3_pi/2026/10/28/382460229_swatch.jpg" alt="Noir">
          </div>
          <a class="product-intro__color-radio ${activeColor === 'Rouge' ? 'product-intro__color-radio_active' : ''}" href="/Robe-fleurie-Rouge-p-400991122.html" data-color-name="Rouge">
            <img src="//img.ltwebstatic.com/images3_pi/2026/10/28/400991122_swatch.jpg" alt="Rouge">
          </a>
          <a class="product-intro__color-radio product-intro__color-radio_disabled" href="/Robe-fleurie-Vert-p-400991199.html" data-color-name="Vert Émeraude" aria-disabled="true">
            <img src="//img.ltwebstatic.com/images3_pi/2026/10/28/400991199_swatch.jpg" alt="Vert Émeraude">
          </a>
        </div>
        <div class="product-intro__size">
          <div class="product-intro__size-title">Taille <a href="#guide">Guide des tailles</a> <span>CM</span> <span>INCH</span></div>
          ${goodsId === '382460229' ? `
            <div class="product-intro__size-radio ${selectedSize === 'S' ? 'product-intro__size-radio_active' : ''}" role="radio" aria-checked="${selectedSize === 'S' ? 'true' : 'false'}">
              <span class="product-intro__size-radio-inner">S</span>
            </div>
            <div class="product-intro__size-radio ${selectedSize === 'M' ? 'product-intro__size-radio_active' : ''}" role="radio" aria-checked="${selectedSize === 'M' ? 'true' : 'false'}">
              <span class="product-intro__size-radio-inner">M</span>
              <span class="size-stock-tip">Plus que 3</span>
            </div>
            <div class="product-intro__size-radio product-intro__size-radio_soldout ${selectedSize === 'L' ? 'product-intro__size-radio_active' : ''}" role="radio" aria-disabled="true">
              <span class="product-intro__size-radio-inner">L</span>
            </div>
            <div class="product-intro__size-radio ${selectedSize === 'XL' ? 'product-intro__size-radio_active' : ''}" role="radio" aria-checked="${selectedSize === 'XL' ? 'true' : 'false'}">
              <span class="product-intro__size-radio-inner">XL</span>
            </div>
          ` : `
            <div class="product-intro__size-radio ${selectedSize === 'S' ? 'product-intro__size-radio_active' : ''}" role="radio">
              <span class="product-intro__size-radio-inner">S</span>
            </div>
            <div class="product-intro__size-radio ${selectedSize === 'M' ? 'product-intro__size-radio_active' : ''}" role="radio">
              <span class="product-intro__size-radio-inner">M</span>
            </div>
          `}
        </div>
        ${opts.soldOutBanner
          ? `<div class="product-intro__soldout">${opts.soldOutBanner}</div>`
          : `<div class="product-intro__add-btn"><button type="button">${addButtonLabel}</button></div>`}
      </div>
      <section class="recommend-carousel">
        <div class="product-intro__head-price">7,99 €</div>
        <div class="sale-price">9,49 €</div>
      </section>
    </main>
  </body></html>`;
}

export function buildAliExpressCometPage(opts: {
  itemId?: string;
  stateItemId?: string;
  currency?: string;
  selectedColor?: string | null;
  selectedPlug?: string | null;
  domSplitPriceHtml?: string;
  addButtonLabel?: string;
  quantityTip?: string;
  canonicalHref?: string;
  includeSingleShipFrom?: boolean;
  splitSkuOffers?: boolean;
}): string {
  const itemId = opts.itemId ?? '1005008811223344';
  const stateItemId = opts.stateItemId ?? itemId;
  const currency = opts.currency ?? 'USD';
  const isEur = currency === 'EUR';
  const colorTitle = isEur ? 'Couleur' : 'Color';
  const plugTitle = isEur ? 'Prise' : 'Plug Type';
  const blackLabel = isEur ? 'Noir' : 'Black';
  const redLabel = isEur ? 'Rouge' : 'Red';

  const properties: any[] = [
    {
      skuPropertyId: 14,
      skuPropertyName: colorTitle,
      skuPropertyValues: [
        {
          propertyValueIdLong: 193,
          propertyValueDisplayName: blackLabel,
          skuPropertyImagePath: '//ae01.alicdn.com/kf/S111111black.jpg_80x80q90.jpg_.webp',
        },
        {
          propertyValueIdLong: 175,
          propertyValueDisplayName: redLabel,
          skuPropertyImagePath: '//ae01.alicdn.com/kf/S222222red.jpg_80x80q90.jpg_.webp',
        },
      ],
    },
    {
      skuPropertyId: 200007763,
      skuPropertyName: plugTitle,
      skuPropertyValues: [
        { propertyValueIdLong: 201336100, propertyValueDisplayName: 'EU Plug' },
        { propertyValueIdLong: 201336106, propertyValueDisplayName: 'US Plug' },
      ],
    },
  ];
  if (opts.includeSingleShipFrom) {
    properties.push({
      skuPropertyId: 200007764,
      skuPropertyName: 'Ships From',
      skuPropertyValues: [
        { propertyValueIdLong: 201336199, propertyValueDisplayName: 'China' },
      ],
    });
  }

  const shipSuffix = opts.includeSingleShipFrom ? ';200007764:201336199#China' : '';
  const runParamsData = {
    productInfoComponent: {
      id: stateItemId,
      subject: isEur ? 'Chargeur GaN 65W Rapide USB-C' : 'Baseus 65W GaN Fast Charger USB-C',
    },
    productPropComponent: {
      props: [
        { attrName: 'Brand Name', attrValue: 'BASEUS' },
      ],
    },
    imageComponent: {
      imagePathList: [
        '//ae01.alicdn.com/kf/Smain01charger.jpg',
        '//ae01.alicdn.com/kf/Smain02charger.jpg',
      ],
    },
    inventoryComponent: {
      totalAvailQuantity: opts.quantityTip && /can't ship|sold out/i.test(opts.quantityTip) ? 0 : 28,
    },
    priceComponent: {
      currencyCode: currency,
      discountPrice: {
        minActivityAmount: { value: isEur ? 18.9 : 18.5, currency },
        maxActivityAmount: { value: isEur ? 24.9 : 23.99, currency },
      },
    },
    skuComponent: {
      productSKUPropertyList: properties,
      skuPriceList: [
        {
          skuIdStr: '12000039001',
          skuAttr: `14:193#${blackLabel};200007763:201336100#EU Plug${shipSuffix}`,
          skuVal: {
            availQuantity: 15,
            actSkuMultiCurrencyCalPrice: isEur ? '24.90' : '19.99',
            skuMultiCurrencyCalPrice: isEur ? '39.90' : '32.99',
          },
        },
        {
          skuIdStr: '12000039002',
          skuAttr: `14:193#${blackLabel};200007763:201336106#US Plug${shipSuffix}`,
          skuVal: {
            availQuantity: 10,
            actSkuMultiCurrencyCalPrice: isEur ? '18.90' : '18.50',
            skuMultiCurrencyCalPrice: isEur ? '29.90' : '29.99',
          },
        },
        {
          skuIdStr: '12000039003',
          skuAttr: `14:175#${redLabel};200007763:201336100#EU Plug${shipSuffix}`,
          skuVal: {
            availQuantity: 3,
            actSkuMultiCurrencyCalPrice: isEur ? '26.50' : '23.99',
            skuMultiCurrencyCalPrice: isEur ? '41.90' : '36.99',
          },
        },
        {
          skuIdStr: '12000039004',
          skuAttr: `14:175#${redLabel};200007763:201336106#US Plug${shipSuffix}`,
          skuVal: {
            availQuantity: 0,
            actSkuMultiCurrencyCalPrice: isEur ? '22.90' : '21.99',
            skuMultiCurrencyCalPrice: isEur ? '35.90' : '34.99',
          },
        },
      ],
    },
  };

  const renderedData = opts.splitSkuOffers ? {
    ...runParamsData,
    priceComponent: {
      ...runParamsData.priceComponent,
      skuPriceList: runParamsData.skuComponent.skuPriceList.map(({ skuIdStr, skuVal }) => ({
        skuIdStr, skuVal: { actSkuMultiCurrencyCalPrice: skuVal.actSkuMultiCurrencyCalPrice },
      })).reverse(),
    },
    skuComponent: {
      productSKUPropertyList: properties,
      skuPaths: runParamsData.skuComponent.skuPriceList.map(({ skuIdStr, skuAttr, skuVal }) => ({
        skuIdStr, skuAttr, skuVal: { availQuantity: skuVal.availQuantity, skuMultiCurrencyCalPrice: skuVal.skuMultiCurrencyCalPrice },
      })),
    },
  } : runParamsData;

  const defaultDomPrice = isEur
    ? '<span>24</span> <span>,</span> <span>90</span> <span>€</span> <span>/ pièce</span>'
    : '<span>US $</span> <span>19</span> <span>.</span> <span>99</span> <span>/ piece</span>';

  return `<!doctype html>
<html lang="${isEur ? 'fr' : 'en'}">
<head>
  <title>${runParamsData.productInfoComponent.subject} - AliExpress</title>
  ${opts.canonicalHref ? `<link rel="canonical" href="${opts.canonicalHref}" />` : ''}
  <meta property="product:price:amount" content="${isEur ? '18.90' : '18.50'}" />
  <meta property="product:price:currency" content="${currency}" />
  <script>window.runParams = { data: ${JSON.stringify(renderedData)} };</script>
</head>
<body>
  <main class="pdp-body">
    <h1 data-pl="product-title">${runParamsData.productInfoComponent.subject}</h1>
    <div data-pl="product-price">
      <div class="price--currentPriceText--V8_y_b5">${opts.domSplitPriceHtml ?? defaultDomPrice}</div>
      <del class="price--originalText--gxVO5_d">${isEur ? '39,90 €' : 'US $32.99'}</del>
      <span class="price--discount--Y9uG2">-38%</span>
    </div>

    <div data-pl="product-sku">
      <div class="sku-item--property--HuasaIz">
        <div class="sku-item--title--Z0HLO87">${colorTitle}: ${opts.selectedColor || ''}</div>
        <div class="sku-item--skus--StEhULs">
          <div data-sku-col="14-193" title="${blackLabel}" class="sku-item--image--jMUnnGA ${opts.selectedColor === blackLabel ? 'sku-item--selected--ITGY_EO' : ''}">
            <img src="https://ae01.alicdn.com/kf/S111111black.jpg_80x80q90.jpg_.webp" alt="${blackLabel}" />
          </div>
          <div data-sku-col="14-175" title="${redLabel}" class="sku-item--image--jMUnnGA ${opts.selectedColor === redLabel ? 'sku-item--selected--ITGY_EO' : ''}">
            <img src="https://ae01.alicdn.com/kf/S222222red.jpg_80x80q90.jpg_.webp" alt="${redLabel}" />
          </div>
        </div>
      </div>

      <div class="sku-item--property--HuasaIz">
        <div class="sku-item--title--Z0HLO87">${plugTitle}: ${opts.selectedPlug || ''}</div>
        <div class="sku-item--skus--StEhULs">
          <div data-sku-col="200007763-201336100" title="EU Plug" class="sku-item--text--hRIJ181 ${opts.selectedPlug === 'EU Plug' ? 'sku-item--selected--ITGY_EO' : ''}">
            <span>EU Plug</span>
          </div>
          <div data-sku-col="200007763-201336106" title="US Plug" class="sku-item--text--hRIJ181 ${opts.selectedPlug === 'US Plug' ? 'sku-item--selected--ITGY_EO' : ''}">
            <span>US Plug</span>
          </div>
        </div>
      </div>
    </div>

    ${opts.quantityTip ? `<div data-pl="product-quantity">${opts.quantityTip}</div>` : '<div data-pl="product-quantity">15 pieces available</div>'}
    <div data-pl="product-action">
      ${opts.addButtonLabel === '' ? '' : `<button type="button" class="comet-v2-btn">${opts.addButtonLabel ?? (isEur ? 'Ajouter au panier' : 'Add to Cart')}</button>`}
    </div>

    <section class="more-to-love recommend-container">
      <div class="price--currentPriceText--V8_y_b5">${isEur ? '1,99 €' : 'US $1.99'}</div>
      <button type="button">Add to Cart</button>
    </section>
  </main>
</body>
</html>`;
}

/** Fiche TEMU (rawData + radiogroups) — `color` / `size` cochés ou non. */
export function buildTemuSelectionPage(opts: { color?: string | null; size?: string | null; price?: string; goodsId?: string; soldOutSize?: string }): string {
  const goodsId = opts.goodsId ?? '601099512345678';
  const price = opts.price ?? '14,49 €';
  const radio = (value: string, checked: boolean, disabled = false) =>
    `<div role="radio" aria-checked="${checked ? 'true' : 'false'}"${disabled ? ' aria-disabled="true" class="sold-out"' : ''}>${value}</div>`;
  const skus = [
    { skuId: 'sku_gris_m', color: 'Gris foncé', size: 'M', stock: 4 },
    { skuId: 'sku_gris_l', color: 'Gris foncé', size: 'L', stock: opts.soldOutSize === 'L' ? 0 : 12 },
    { skuId: 'sku_noir_m', color: 'Noir', size: 'M', stock: 5 },
    { skuId: 'sku_noir_l', color: 'Noir', size: 'L', stock: 7 },
  ];
  return `<!doctype html><html lang="fr"><head><title>Sweat à capuche zippé homme — Temu</title></head><body><main>
    <h1>Sweat à capuche zippé homme</h1>
    <div id="goods_price">${price}</div>
    <div role="radiogroup" aria-label="Couleur">${radio('Gris foncé', opts.color === 'Gris foncé')}${radio('Noir', opts.color === 'Noir')}</div>
    <div role="radiogroup" aria-label="Taille">${radio('M', opts.size === 'M')}${radio('L', opts.size === 'L', opts.soldOutSize === 'L')}</div>
    <div role="button">Ajouter au panier</div>
  </main>
  <script>window.rawData = ${JSON.stringify({
    store: {
      goods: { goodsId, goodsName: 'Sweat à capuche zippé homme', hdThumbUrl: 'https://img.kwcdn.com/product/Fancyalgo/VirtualModelMatting/999888777.jpg', minOnSalePrice: price, currency: 'EUR' },
      sku: skus.map((sku) => ({ skuId: sku.skuId, stockQuantity: sku.stock, normalPriceStr: price, specs: [{ specKey: 'Couleur', specValue: sku.color }, { specKey: 'Taille', specValue: sku.size }] })),
    },
  })};</script></body></html>`;
}
