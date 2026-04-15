from bs4 import BeautifulSoup
episodeDoc = "https://lostpedia.fandom.com/wiki/Portal:Episodes" # Need to edit the link here
# Importing the HTTP library
import requests as req

epSoup = BeautifulSoup(episodeDoc, 'html.parser')
print(epSoup.prettify())


for a in epSoup.find_all('a', href=True):
   print ("Found the URL:", a['href'])
