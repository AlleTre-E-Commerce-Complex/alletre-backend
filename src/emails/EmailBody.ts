export class EmailBody {
  // constructor() {}

  emailBody(body: any, token?: any) {
    const imgSrc = body.img ? body.img : '';
    const message = body.message ? body.message : '';
    const Product_Name = body.Product_Name ? body.Product_Name : '';
    let data: any;
    for (const [key, value] of Object.entries(body)) {
      if (
        key !== 'img' &&
        key !== 'message' &&
        key !== 'subject' &&
        key !== 'Button_URL' &&
        key !== 'title' &&
        key !== 'Button_text'
      ) {
        data += `<p>${key} : <span>${value}</span></p>`;
      }
    }

    return `<html>
   
 <body
  style="
    margin: auto;
    padding: 0;
    background-color: #ffffff;
    max-width: 600px;
    font-family: Montserrat;
    line-height: 1.6;
    color: #a;
  "
>
  <div style="padding: 20px; text-align: center">
    <div
      style="
        background-color: #f9f9f9;
        padding: 20px;
        color: white;
        margin: 40px auto;
        text-align: center;
        position: relative;
        max-width: 100%;
        border-radius: 15px;
      "
    >
      <img
        src=" "
        alt="Alletre Logo"
        style="
          max-width: 80px;
          position: absolute;
          padding-top: 20px;
          display: block;
        "
      />
      <h3
        style="
          margin-top: 30px;
          font-size: min(22px, 4vw); /* Smaller size for mobile */
          font-weight: bold;
          color: #a91d3a;
        "
      >
        ${body.title}
      </h3>
      <h2
        style="
          margin: 50px 0px 19px;
          font-size: min(17px, 3vw);
          color: #333;
          text-align: left;
          font-weight: 500;
        "
      >
        "Hi,${body.userName}",
      </h2>

      <div
        style="
          margin: 20px auto;
          font-size: min(15px, 3vw); /* Adjust font size for mobile */
          line-height: 1.2; /* Slightly tighter line height for mobile */
          max-width: 90%; /* Ensure proper fit on smaller screens */
          color: #333;
          text-align: left;
        "
      >
        ${body.message1}

        <div style="text-align: center">
          <a
            href="${body.Button_URL}"
            style="
              display: inline-block;
              padding: 12px 20px;
              background-color: #a91d3a !important;
              -webkit-background-color: #a91d3a !important;
              -moz-background-color: #a91d3a !important;
              color: #ffffff !important;
              text-decoration: none;
              border-radius: 10px;
              font-weight: bold;
              margin: 20px 0;
              font-size: 18px;
            "
          >
            ${body.Button_text}
          </a>
        </div>
        <div style="margin: 50px auto; text-align: center">
          <img
            src="${imgSrc}"
            style="
            width: 100%;
            max-width: 250px; 
            height: auto;
            border-radius: 8px;
            display: inline-block;
            "
          />
        </div>
        <p>${body.message2}</p>

        
      </div>
    </div>
    <h3
      style="
        margin: 30px auto 20px auto; /* Matches auto margins of the p element */
        font-size: min(16px, 4vw); /* Smaller size for mobile */
        font-weight: bold;
        color: #a91d3a;
        text-align: left; /* Align text to the left */
        max-width: 90%; /* Ensure proper fit and alignment */
      "
    >
      Ecommerce and Online Auctions: Revolutionizing the Digital Marketplace
    </h3>
    <p
      style="
        margin: 20px auto;
        font-size: min(13px, 3vw); /* Adjust font size for mobile */
        line-height: 1.4; /* Slightly tighter line height for mobile */
        max-width: 90%; /* Ensure proper fit on smaller screens */
        text-align: left;
        color: #707070;
      "
    >
      The world of ecommerce and online auctions has significantly transformed
      the way people buy and sell goods and services. As technology continues to
      evolve, both of these models have shaped the digital economy, offering
      convenience, access, and new opportunities for both consumers and sellers
      alike. Let's dive deeper into how ecommerce and online auctions work,
      their benefits, challenges, and how they continue to shape the future of
      retail.
    </p>

    <p style="font-size: min(16px, 4vw); color: #707070">FOLLOW US!</p>
    <div style="margin: 20px 0">
      <!-- Instagram Icon -->
      <a
        href="https://www.instagram.com/alletre.ae/"
        target="_blank"
        style="margin: 0 5px; display: inline-block"
      >
        <img
          src="https://firebasestorage.googleapis.com/v0/b/allatre-2e988.appspot.com/o/instagram%20Icon.png?alt=media&token=4ca91fcd-2e6f-476c-a0e6-fb6c81c0ac47"
          alt="Instagram"
          style="width: 30px; height: 30px"
        />
      </a>

      <!-- Facebook Icon -->
      <a
        href="https://www.facebook.com/alletr.ae"
        target="_blank"
        style="margin: 0 5px; display: inline-block"
      >
        <img
          src="https://firebasestorage.googleapis.com/v0/b/allatre-2e988.appspot.com/o/Facebook%20Icon.png?alt=media&token=15e160e4-1bfb-4e81-9a12-1c41f83edabb"
          alt="Facebook"
          style="width: 30px; height: 30px"
        />
      </a>

      <!-- Snapchat Icon -->
      <a
        href="https://www.snapchat.com/add/alletre"
        target="_blank"
        style="margin: 0 5px; display: inline-block"
      >
        <img
          src="https://firebasestorage.googleapis.com/v0/b/allatre-2e988.appspot.com/o/Snapchat%20Icon.png?alt=media&token=1a20756e-84f5-4e33-bf1a-f935e626e9b7"
          alt="Snapchat"
          style="width: 30px; height: 30px"
        />
      </a>

      <!-- TikTok Icon -->
      <a
        href="https://www.tiktok.com/@alletre.ae"
        target="_blank"
        style="margin: 0 5px; display: inline-block"
      >
        <img
          src="https://firebasestorage.googleapis.com/v0/b/allatre-2e988.appspot.com/o/Tick%20Tok%20Icon.png?alt=media&token=6bb9d534-2031-4bf2-870d-a867be937d83"
          alt="TikTok"
          style="width: 30px; height: 30px"
        />
      </a>

      <!-- YouTube Icon -->
      <a
        href="https://www.youtube.com/@Alletre_ae"
        target="_blank"
        style="margin: 0 5px; display: inline-block"
      >
        <img
          src="https://firebasestorage.googleapis.com/v0/b/allatre-2e988.appspot.com/o/Youtube%20Icon.png?alt=media&token=ccb87278-f063-4838-9b02-7ceffae7c710"
          alt="YouTube"
          style="width: 30px; height: 30px"
        />
      </a>
    </div>

    <p
      style="
        font-size: 16px;
        margin-top: -20px;
        color: #333;
        letter-spacing: 4px;
      "
    >
      www.alletre.com
    </p>
    <p
      style="
        margin: 20px auto;
        font-size: min(10px, 3vw); /* Adjust font size for mobile */
        line-height: 1.4; /* Slightly tighter line height for mobile */
        max-width: 90%; /* Ensure proper fit on smaller screens */
        color: #acacac;
      "
    >
      This email was sent to ${body.userName} because you indicated that you'd
      like to receive new, Auctions, and updates from Alletre. If you don't want
      to receive such emails in the future, please
      <a
        href="unsubscribe-link-here"
        style="
          display: inline-block;
          color: blue; /* Text color */
          text-decoration: underline; /* Add underline */
          background: none; /* No background */
          border: none; /* No border */
          padding: 0; /* Remove padding */
          font-size: inherit; /* Match the paragraph font size */
        "
      >
        Unsubscribe Here </a
      >.
    </p>
  </div>
</body>

  </html>`;
  }
}
