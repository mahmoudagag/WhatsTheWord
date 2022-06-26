const express = require('express')
const fs = require('fs')
var csv = require('csv-parser')
const cors = require('cors')
const app = express()
const server = require('http').createServer(app)

const path = require('path')



app.use(express.json())

app.use(cors())
const io = require("socket.io")(server,{
    cors:{
        origin: "*"
    }
})

app.use(express.static(path.join(__dirname,'build')))

app.get('/',(req,res) =>{
    res.sendFile(path.join(_dirname,'build','index.html'))
})

const port = process.env.PORT || 5000;

const start = async() =>{
    server.listen(port, () => {
        console.log(`Server is listening to port ${port}...`)
    })
}

const letters = []
let n
fs.createReadStream('letters.csv')
    .pipe(csv({}))
    .on('data', (data) =>letters.push(data.letters))
    .on('end', () => {
        n = letters.length
        start()
    })

const rooms = {}
const players = {}
io.on('connection', socket => {
    console.log(socket.id)
    socket.on('create-room', (user,room,cb) => {
        socket.join(room)
        if( !rooms[room] ){ rooms[room] = {} }

        rooms[room].host = user
        rooms[room].room = room
        rooms[room].current = 0
        rooms[room].turn = 0
        rooms[room].letters = randomLetters()
        rooms[room].isplaying = false
        let player = { socket: socket.id , name : user, lives: 3} 
        rooms[room].players = [player]

        players[socket.id] = room

        cb(rooms[room])
        
        //io.sockets.adapter.rooms.get(room).players = [ user ]
        
    })

    socket.on('join-room',(user,room,cb) =>{
        if(rooms[room]){
            if(rooms[room].isplaying){
                cb({error:true, msg:"Game is currently being played"})
            }else{
                socket.join(room)

                let player = {socket: socket.id , name : user, lives: 3} 
                rooms[room].players.push(player)
    
                players[socket.id] = room
    
                cb(rooms[room])
                socket.to(room).emit('users-changed',rooms[room])
            }
        }else{
            cb({error:true, msg:"Game can't be found"})
        }
    })
    socket.on('game-started',() => {
        // in to include sender
        let room = players[socket.id]
        if(rooms[room]){
            rooms[room].isplaying = true
            io.sockets.in(players[socket.id]).emit('game-started', rooms[room])
        }

    })

    socket.on('update-word',(word) => {
        //io.sockets.in(socket.room).emit
        let room = players[socket.id]
        socket.to(room).emit('new-word', word)
    })


    socket.on('next-player',(username,turn,status) => {
        let id = socket.id 
        let room = players[id]
        if(room && rooms[room].isplaying){
            if(status == 'wrong' && rooms[room].turn != turn ){
                return 
            }
            if(status == 'wrong' && rooms[room].turn == turn){
                rooms[room].players.forEach( (player) => {
                    if (player.name === username ){
                        if(player.lives != 0){
                            player.lives -= 1
                        }
                        else {
                            return 
                        }
                    }
                })
            }
            if( isGameOver(rooms[room].players) ){
                let winner = findWinner(rooms[room].players)
                resetGame(rooms[room])
                io.sockets.in(room).emit("game-over",rooms[room],winner)
            }else{
                let curr = rooms[room].current
                
                let val = findNextPlayer(curr, rooms[room].players)
        
                rooms[room].current = val
                rooms[room].turn += 1
                rooms[room].letters = randomLetters()
                io.sockets.in(room).emit("next-player",rooms[room])
            }
        }
    })
    socket.on('disconnect', () => {
        let id = socket.id 
        let room = players[id]
        if(room){
            if( rooms[room].players.length === 1){
                delete rooms[room]
            }else{
                if (rooms[room].players[0].socket === id){
                    rooms[room].host = rooms[room].players[1].name
                }
                let curr = rooms[room].current
                //in game
                if(rooms[room].isplaying && rooms[room].players[curr].socket === id){ //rooms[room].turn
                    let val = findNextPlayer(curr, rooms[room].players)
    
                    rooms[room].players = rooms[room].players.filter( (player) => player.socket != id)
                    socket.to(room).emit('users-changed',rooms[room])
                    
                    if( isGameOver(rooms[room].players) ){
                        let winner = findWinner(rooms[room].players)
                        resetGame(rooms[room])
                        io.sockets.in(room).emit("game-over",rooms[room],winner)
                    }else{
                        rooms[room].current = val - 1
                        rooms[room].turn += 1
                        rooms[room].letters = randomLetters()
                        io.sockets.in(room).emit("next-player",rooms[room])
                    }
                }else{
                    // in lobby
                    rooms[room].players = rooms[room].players.filter( (player) => player.socket != id)
                    socket.to(room).emit('users-changed',rooms[room])
                }
                delete players[id]
            }
        }
    })

})

function randomLetters(){
    let i = Math.floor(Math.random() * n);
    return letters[i]
}


function resetGame(room){
    room.current = 0
    room.turn = 0
    room.players.map( (player) =>{
        player.lives = 3
    })
    room.isplaying = false
    console.log(room)

}
function findNextPlayer(curr,players){
    let newCurrent = (curr+1) % players.length
    while( curr !== newCurrent){
        if(players[newCurrent].lives > 0){
            return newCurrent
        }
        newCurrent = (newCurrent+1) % players.length
    }
    return newCurrent
}

function isGameOver(players){
    let count = 0
    for( var i = 0; i< players.length; i++){
        if (players[i].lives > 0){
            count += 1
        }    
        if (count > 1){
            return false
        } 
    }
    return !(count > 1)
}

function findWinner(players){
    for(let i = 0; i < players.length; i++){
        if (players[i].lives > 0){
            return players[i]
        }
    }
}

