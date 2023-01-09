import React, { useState } from 'react';
import { v4 as uuidv4 } from "uuid";
import Recipe from "./components/Recipe";
import Alert from "./components/Alert";
import Axios from "axios";
import './App.css';

const App=() =>{
  const[query, setQuery] = useState("");
  const [recipes, setRecipes] = useState([]);
  const [alert, setAlert] = useState("");

  const APP_ID="f57e7a64";
  const APP_KEY="6d8a60405bebea5ea56356fa7f5cfcd3";

  // Spoonacular API Key: d459fd2233444a70a4fe0a4796ad420c
  // GET https://api.spoonacular.com/recipes/complexSearch



  const url=`https://api.edamam.com/search?q=${query}&app_id=${APP_ID}&app_key=${APP_KEY}`
  
  const getData = async () => {
    if (query !== "") {
      const result = await Axios.get(url);
      if (!result.data.more) {
        return setAlert("We can't find a recipe with that ingredient.");
      }
      console.log(result);
      setRecipes(result.data.hits);
      setQuery("");
      setAlert("");
    } else {
      setAlert("Try searching for chocolate");
    }
  };
  const onChange = e => setQuery(e.target.value);

  const onSubmit = e => {
    e.preventDefault();
    getData();
  };

  return (
    <div>
      <div className="App">
        <h1>Search for recipes by starting with a couple ingredients from your fridge or pantry.</h1>
        <form className="search-form" onSubmit={onSubmit}>
        {alert !== "" && <Alert alert={alert} />}
          <input
            type="text"
            value={query}
            placeholder ="If you give me some ingredients, I'll see what recipes I can find." 
            autoComplete="off" 
            onChange={onChange}  
          />

        <input type="submit" value="Search" />
        </form>
        <div className="recipes">
        {recipes !== [] &&
          recipes.map(recipe => <Recipe key={uuidv4()} recipe={recipe} />)}
        </div>
      </div>
    </div>
  );
};



// "https://api.edamam.com/search?q=chicken&app_id=${YOUR_APP_ID}&app_key=${YOUR_APP_KEY}&from=0&to=3&calories=591-722&health=alcohol-free"


export default App;
