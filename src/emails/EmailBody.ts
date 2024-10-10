export class EmailBody{

    constructor(){}

    emailBody(body:any,token?:any,){
        const imgSrc = body.img ? body.img : ''
        const message = body.message ? body.message :''
        console.log('emial body :',body)
        let data:any
        for(let [key,value] of Object.entries(body)){
           if(
                key !== 'img' && 
                key !== 'message' && 
                key !== 'subject' &&
                key !== 'Button_URL' &&
                key !== 'title' &&
                key !== 'Button_text')
            {
                data += `<p>${key} : <span>${value}</span></p>`
            }
        }


        return(
            `<html>
    <head>
      <meta charset="UTF-8">
      <style>
        /* Set background color and font styles */
        body {
          background-color: #F7F7F7;
          font-family: Arial, sans-serif;
        }
        
        /* Center the email content */
        .container {
          width: 600px;
          margin: 0 auto;
        }
        
        /* Add padding and borders to the email content */
        .content {
          padding: 40px;
          background-color: #FFFFFF;
          border-radius: 10px;
          border: 1px solid #9f0758;
        }
        
        /* Style the heading */
        h1 {
          font-size: 32px;
          margin-top: 0;
          text-align: center;
        }
        
        /* Style the text content */
        p {
          font-size: 18px;
          margin-top: 15px;
        }
        
        /* Style the button */
        .button {
          display: inline-block;
          background-color: #69053a;
          color: #FFFFFF;
          padding: 10px 20px;
          text-decoration: none;
          border-radius: 5px;
          margin-top: 20px;
          /* Add transition and transform properties */
          transition: transform 0.2s ease-in-out;
          transform: translateY(0);
        }
  
        /* Change the color of the text inside the button */
        .button span {
          color: #FFFFFF;
        }
  
        .button:hover {
          transform: translateY(-10px);
        }
  
        img{
          width: 180px;
          height: 80px;
          border-radius: 10%;  
        }
        .mainBody{
            display: flex;
            width:100%;
            justify-content: space-between;

        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="content">
          <h1>${body.title}</h1>
            <div class="mainBody">
                <div>
                    ${data} 
                </div>
                <div>
                    <img src="${imgSrc}" alt="">
                </div>
            </div>
            <p>Message : <span>${message}</span> </p>
          <a class="button" href="${body.Button_URL}"><span>${body.Button_text}</span></a>
        </div>
      </div>
    </body>
  </html>`
        )
    }
}

