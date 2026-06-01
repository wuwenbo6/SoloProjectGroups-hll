package main

import (
	"log"
	"tacacs-simulator/controller"
	"tacacs-simulator/repository"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	repo := repository.NewRepository()
	ctrl := controller.NewController(repo)

	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"*"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	}))

	api := r.Group("/api")
	{
		api.POST("/auth", ctrl.Auth)
		api.POST("/authorize", ctrl.Authorize)
		api.POST("/accounting", ctrl.Accounting)

		api.GET("/config", ctrl.GetConfig)
		api.PUT("/config", ctrl.UpdateConfig)

		api.GET("/users", ctrl.GetUsers)
		api.POST("/users", ctrl.CreateUser)
		api.PUT("/users/:username", ctrl.UpdateUser)
		api.DELETE("/users/:username", ctrl.DeleteUser)

		api.GET("/policies", ctrl.GetPolicies)
		api.POST("/policies", ctrl.CreatePolicy)
		api.PUT("/policies/:id", ctrl.UpdatePolicy)
		api.DELETE("/policies/:id", ctrl.DeletePolicy)

		api.GET("/sessions", ctrl.GetSessions)
		api.GET("/packets", ctrl.GetPackets)
		api.GET("/packets/export/json", ctrl.ExportPacketsJSON)
		api.GET("/packets/export/csv", ctrl.ExportPacketsCSV)
	}

	log.Println("TACACS+ Simulator backend starting on port 8080")
	log.Println("Default users: admin/admin123, user/user123")
	log.Println("Default shared secret: tacacs_secret")
	r.Run(":8080")
}
