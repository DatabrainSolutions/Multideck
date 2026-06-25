using Multideck.Server.Modules.Users;
using Multideck.Server.Configuration;
using Multideck.Server.Modules.Auth;
using Multideck.Server.Modules.Authorization;
using Multideck.Server.Extensions;

var builder = WebApplication.CreateBuilder(args);
var supabaseAuth = SupabaseAuthOptions.FromConfiguration(builder.Configuration);

builder.Services.AddMultideckServer(builder.Configuration, supabaseAuth);

var app = builder.Build();

app.UseMultideckServer(supabaseAuth);

app.MapRootEndpoint();
app.MapAuthModule(supabaseAuth);
app.MapAuthorizationModule(supabaseAuth);
app.MapUsersModule(supabaseAuth);

app.Run();
