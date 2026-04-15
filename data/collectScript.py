from bs4 import BeautifulSoup
import requests as req

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
}
session = req.Session()
session.headers.update(headers)

# Might need to send the output to the file instead of printing it out, but for now just print it out to see if it works
html_doc = session.get('https://lostpedia.fandom.com/wiki/Pilot,_Part_1_transcript') # This is the link to the transcript of the first episode, need to edit this for each episode

if html_doc.status_code == 200:
    # Creating a BeautifulSoup object and specifying the parser
    S = BeautifulSoup(html_doc.content , 'html.parser')
  
    # Using the prettify method
    print(S.prettify())


    listOfBold =  S.find_all('div', class_='poem'); 
    for item in listOfBold:
        bold = item.find('b')
        print(bold) 
        txt = item.get_text()
        said = txt.split(":")
        print(said[ len(said)-1])
else:
    print(f"fail: status code {html_doc.status_code}")
