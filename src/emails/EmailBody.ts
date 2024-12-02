export class EmailBody {
  // constructor() {}

  emailBody(body: any, token?: any) {
    const imgSrc = body.img ? body.img : '';
    const message = body.message ? body.message : '';
    console.log('emial body :', body);
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
     <head>
    <link
      rel="stylesheet"
      href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"
    />
  </head>
    <body style="margin: 0; padding: 0; background-color: #ffffff">
    <div
      style="
        font-family: Arial, sans-serif;
        line-height: 1.6;
        text-align: center;
        color: #333;
      "
    >
      <div
        style="
          background-color: #a91d3a;
          padding: 350px;
          color: white;
          margin: 50px auto; /* Adds top margin and centers horizontally */
          text-align: center; /* Ensures the icon is centered */
          position: relative; /* Allows positioning of the image */
          padding: 20px;
          max-width: 600px; /* Sets the width of the container */
          border-radius: 12px;
        "
      >
        <img
          src="https://firebasestorage.googleapis.com/v0/b/allatre-2e988.appspot.com/o/10.png?alt=media&token=38270fdb-8c83-4fb1-b51b-4ba4682ae827"
          alt="Alletre Logo"
          style="
            max-width: 80px;
            margin: 0 auto 20px;
            position: absolute;
            top: 75px; /* Moves the icon above the top edge of the container */
            left: 50%;
            transform: translateX(-50%); /* Centers the icon horizontally */
          "
        />

        <h2
          style="
            margin: 120px 0 0; /* Moves it upwards slightly */
            font-weight: bold; /* Makes the text bolder */
            font-size: 36px;
            text-align: center;
          "
        >
          Your Auction has been expired
        </h2>

        <div
          style="
            background: white;
            padding: 10px;
            border-radius: 12px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
            display: inline-block;
            border: 1px solid #eee;
          "
        >
          <img
            src="${imgSrc}"
            alt="Product Image"
            style="
              width: 300px;
              height: auto;
              border-radius: 8px;
              display: block;
              max-width: 100%;
            "
          />
        </div>
        <h1
          style="
            text-align: center;
            margin-bottom: 30px;
            font-size: 28px;
            color: white;
            text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.1);
          "
        >
          ${body.title}
        </h1>
        <p>Message : <span>${message}</span></p>
        <a
          href="${process.env.FRONT_URL}"
          style="
            display: inline-block;
            padding: 12px 10px;
            background-color: rgb(158, 151, 151);
            color: #a91d3a !important;
            text-decoration: none;
            border-radius: 10px; /* Increased border-radius for a more rounded button */
            font-weight: bold;
            mso-line-height-rule: exactly;
            width: 250px; /* Button width */
            text-align: center; /* Center the text */
            max-width: 100%;
            white-space: nowrap;
          "
        >
          <span
            style="
              display: block;
              width: 100%;
              text-align: center;
              letter-spacing: 3px;
              font-size: 19px;
              line-height: 30px; /* Increased line height to make text appear taller */
            "
          >
            View Auction Now!
          </span>
        </a>
      </div>
    </div>
  </body>
  </html>`;
  }
}
