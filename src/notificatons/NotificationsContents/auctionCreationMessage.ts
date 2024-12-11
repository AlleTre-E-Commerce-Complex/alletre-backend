export const auctionCreationMessage = (auction: any) => {
  return `
  <div style="display: flex; align-items: center; justify-content: space-between; padding: 0px 10px; ">
    <h1 style="font-size: 16px; font-weight: bold;">${auction.product.title}</h1>   
    <img src="${auction.product.images[0].imageLink}" alt="Product Image" style="width: 100%; max-width: 100px; height: auto; border-radius: 8px; display: inline-block;">
  </div>
  `;
};
