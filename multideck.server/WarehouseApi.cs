using Multideck.Server.Configuration;
using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Serialization;

internal static class WarehouseApi
{
    public static void MapWarehouseApi(this WebApplication app, SupabaseAuthOptions supabaseAuth)
    {
        var warehouseApi = app.MapGroup("/api/warehouse").WithTags("Warehouse");

        if (!supabaseAuth.HasServiceRoleKey)
        {
            warehouseApi.MapGet("/{*path}", () => Results.Problem(
                title: "Warehouse backend is not configured.",
                detail: "Set Supabase:Url and Supabase:ServiceRoleKey for the API. The service role key must stay server-side.",
                statusCode: StatusCodes.Status503ServiceUnavailable));
            return;
        }

        warehouseApi.RequireAuthorization();

        warehouseApi.MapGet("/overview", async (WarehouseService warehouse, ClaimsPrincipal user, HttpContext httpContext, CancellationToken cancellationToken) =>
            Results.Ok(await warehouse.GetOverviewAsync(user, httpContext, cancellationToken)));

        warehouseApi.MapGet("/products", async (WarehouseService warehouse, ClaimsPrincipal user, HttpContext httpContext, CancellationToken cancellationToken) =>
            Results.Ok(await warehouse.GetProductsAsync(user, httpContext, cancellationToken)));

        warehouseApi.MapGet("/stock", async (WarehouseService warehouse, ClaimsPrincipal user, HttpContext httpContext, CancellationToken cancellationToken) =>
            Results.Ok(await warehouse.GetStockAsync(user, httpContext, cancellationToken)));

        warehouseApi.MapGet("/orders", async (WarehouseService warehouse, ClaimsPrincipal user, HttpContext httpContext, CancellationToken cancellationToken) =>
            Results.Ok(await warehouse.GetOrdersAsync(user, httpContext, cancellationToken)));

        warehouseApi.MapGet("/movements", async (WarehouseService warehouse, ClaimsPrincipal user, HttpContext httpContext, CancellationToken cancellationToken) =>
            Results.Ok(await warehouse.GetMovementsAsync(user, httpContext, cancellationToken)));

        warehouseApi.MapGet("/work-items", async (WarehouseService warehouse, ClaimsPrincipal user, HttpContext httpContext, CancellationToken cancellationToken) =>
            Results.Ok(await warehouse.GetWorkItemsAsync(user, httpContext, cancellationToken)));

        warehouseApi.MapGet("/calendar", async (WarehouseService warehouse, ClaimsPrincipal user, HttpContext httpContext, CancellationToken cancellationToken) =>
            Results.Ok(await warehouse.GetCalendarAsync(user, httpContext, cancellationToken)));

        warehouseApi.MapPatch("/work-items/reorder", async (WarehouseWorkItemReorderRequest request, WarehouseService warehouse, ClaimsPrincipal user, HttpContext httpContext, CancellationToken cancellationToken) =>
        {
            await warehouse.ReorderWorkItemsAsync(user, httpContext, request, cancellationToken);
            return Results.NoContent();
        });
    }
}

internal sealed class WarehouseService(SupabaseRestClient supabase)
{
    public async Task<WarehouseOverviewDto> GetOverviewAsync(ClaimsPrincipal user, HttpContext httpContext, CancellationToken cancellationToken)
    {
        var context = await ResolveContextAsync(user, httpContext, cancellationToken);
        var products = await GetProductsAsync(context, cancellationToken);
        var orders = await GetOrdersAsync(context, cancellationToken);
        var stock = await GetStockAsync(context, cancellationToken);
        var calendar = await GetCalendarAsync(context, cancellationToken);

        var capacity = stock.Count == 0 ? 0 : (int)Math.Round(stock.Average(row => row.Fill));
        var dueToday = orders.Count(order => string.Equals(order.Due, "Today", StringComparison.OrdinalIgnoreCase));
        var activeOrders = orders.Count(order => !string.Equals(order.Status, "Loaded", StringComparison.OrdinalIgnoreCase));
        var inboundOrders = orders.Count(order => string.Equals(order.Type, "Inbound", StringComparison.OrdinalIgnoreCase));
        var stockChecks = calendar.Events.Count(item => item.Type.Contains("Stock", StringComparison.OrdinalIgnoreCase));

        return new WarehouseOverviewDto(
            [
                new("Inventory value", "GBP 1.42M", "Across Felixstowe DC and Southampton overflow.", "teal", "Boxes"),
                new("Orders due today", dueToday.ToString(CultureInfo.InvariantCulture), $"{activeOrders} active warehouse orders in the live dataset.", "amber", "Clock3"),
                new("Stock accuracy", "98.4%", "Last cycle count variance was down 0.7%.", "green", "PackageCheck"),
                new("Capacity used", $"{capacity}%", "Average fill across live warehouse stock rows.", "blue", "Gauge"),
            ],
            [
                new("Ready to receive", inboundOrders.ToString(CultureInfo.InvariantCulture), "Clock3", "amber"),
                new("Pick complete", "86%", "CheckCircle2", "green"),
                new("Stock checks", stockChecks.ToString(CultureInfo.InvariantCulture), "PackageCheck", "teal"),
            ]);
    }

    public async Task<IReadOnlyList<WarehouseProductDto>> GetProductsAsync(ClaimsPrincipal user, HttpContext httpContext, CancellationToken cancellationToken)
    {
        var context = await ResolveContextAsync(user, httpContext, cancellationToken);
        return await GetProductsAsync(context, cancellationToken);
    }

    public async Task<IReadOnlyList<WarehouseStockRowDto>> GetStockAsync(ClaimsPrincipal user, HttpContext httpContext, CancellationToken cancellationToken)
    {
        var context = await ResolveContextAsync(user, httpContext, cancellationToken);
        return await GetStockAsync(context, cancellationToken);
    }

    public async Task<IReadOnlyList<WarehouseOrderDto>> GetOrdersAsync(ClaimsPrincipal user, HttpContext httpContext, CancellationToken cancellationToken)
    {
        var context = await ResolveContextAsync(user, httpContext, cancellationToken);
        return await GetOrdersAsync(context, cancellationToken);
    }

    public async Task<IReadOnlyList<WarehouseMovementDto>> GetMovementsAsync(ClaimsPrincipal user, HttpContext httpContext, CancellationToken cancellationToken)
    {
        var context = await ResolveContextAsync(user, httpContext, cancellationToken);
        return await GetMovementsAsync(context, cancellationToken);
    }

    public async Task<WarehouseWorkItemsDto> GetWorkItemsAsync(ClaimsPrincipal user, HttpContext httpContext, CancellationToken cancellationToken)
    {
        var context = await ResolveContextAsync(user, httpContext, cancellationToken);
        return await GetWorkItemsAsync(context, cancellationToken);
    }

    public async Task<WarehouseCalendarDto> GetCalendarAsync(ClaimsPrincipal user, HttpContext httpContext, CancellationToken cancellationToken)
    {
        var context = await ResolveContextAsync(user, httpContext, cancellationToken);
        return await GetCalendarAsync(context, cancellationToken);
    }

    public async Task ReorderWorkItemsAsync(ClaimsPrincipal user, HttpContext httpContext, WarehouseWorkItemReorderRequest request, CancellationToken cancellationToken)
    {
        var context = await ResolveContextAsync(user, httpContext, cancellationToken);

        foreach (var column in request.Columns)
        {
            for (var index = 0; index < column.Cards.Count; index++)
            {
                var card = column.Cards[index];
                await supabase.PatchAsync(
                    "Warehouse_Work_Items",
                    $"Company_ID=eq.{context.CompanyId}&WHWI_Board=eq.{Escape(request.Board)}&WHWI_CardID=eq.{Escape(card.Id)}",
                    new Dictionary<string, object?>
                    {
                        ["WHWI_ColumnID"] = column.Id,
                        ["WHWI_ColumnTitle"] = column.Title,
                        ["WHWI_ColumnMeta"] = column.Meta,
                        ["WHWI_SortOrder"] = index + 1,
                        ["Updated_At"] = DateTimeOffset.UtcNow,
                    },
                    context.AccessToken,
                    cancellationToken);
            }
        }
    }

    private async Task<WarehouseTenantContext> ResolveContextAsync(ClaimsPrincipal user, HttpContext httpContext, CancellationToken cancellationToken)
    {
        var authUserId = user.FindFirstValue("sub");
        if (string.IsNullOrWhiteSpace(authUserId))
        {
            throw new BadHttpRequestException("Missing authenticated user.", StatusCodes.Status401Unauthorized);
        }

        var accessToken = ReadBearerToken(httpContext);
        if (string.IsNullOrWhiteSpace(accessToken))
        {
            throw new BadHttpRequestException("Missing Supabase access token.", StatusCodes.Status401Unauthorized);
        }

        var users = await supabase.GetAsync<List<SupabaseUserRow>>(
            "cmp_Users",
            $"Auth_User_ID=eq.{Escape(authUserId)}&select=User_ID,Company_ID,User_Email",
            accessToken,
            cancellationToken);

        var appUser = users.FirstOrDefault();
        if (appUser is null || appUser.CompanyId is null)
        {
            throw new BadHttpRequestException("This user is not linked to a company.", StatusCodes.Status403Forbidden);
        }

        var modules = await supabase.GetAsync<List<SupabaseModuleRow>>(
            "cmp_Company_Modules",
            $"Company_ID=eq.{appUser.CompanyId}&Module_Code=eq.warehouse&Is_Enabled=eq.true&select=Company_ID",
            accessToken,
            cancellationToken);

        if (modules.Count == 0)
        {
            throw new BadHttpRequestException("Warehouse is not enabled for this company.", StatusCodes.Status403Forbidden);
        }

        return new WarehouseTenantContext(appUser.CompanyId.Value, accessToken);
    }

    private async Task<IReadOnlyList<WarehouseProductDto>> GetProductsAsync(WarehouseTenantContext context, CancellationToken cancellationToken)
    {
        var products = await supabase.GetAsync<List<SupabaseProductRow>>(
            "Warehouse_Products",
            $"Company_ID=eq.{context.CompanyId}&Is_Deleted=eq.false&select=*&order=WHP_Name.asc",
            context.AccessToken,
            cancellationToken);

        var stock = await supabase.GetAsync<List<SupabaseStockRow>>(
            "Warehouse_Stock",
            $"Company_ID=eq.{context.CompanyId}&Is_Deleted=eq.false&select=WHP_ID,WHS_OnHand,WHS_Allocated",
            context.AccessToken,
            cancellationToken);

        var stockByProduct = stock
            .GroupBy(row => row.ProductId)
            .ToDictionary(group => group.Key, group => new
            {
                OnHand = group.Sum(row => row.OnHand),
                Allocated = group.Sum(row => row.Allocated),
            });

        return products.Select(product =>
        {
            stockByProduct.TryGetValue(product.Id, out var balance);
            var onHand = balance?.OnHand ?? 0;
            var allocated = balance?.Allocated ?? 0;

            return new WarehouseProductDto(
                product.UiId,
                product.Name,
                product.CustomerName,
                product.Category ?? string.Empty,
                product.Sku,
                product.HsCode ?? string.Empty,
                product.SupplierRef ?? string.Empty,
                NumberToInt(onHand),
                NumberToInt(onHand - allocated),
                NumberToInt(product.InboundQty),
                product.Status,
                product.Tone,
                product.Owner ?? string.Empty);
        }).ToList();
    }

    private async Task<IReadOnlyList<WarehouseStockRowDto>> GetStockAsync(WarehouseTenantContext context, CancellationToken cancellationToken)
    {
        var products = await supabase.GetAsync<List<SupabaseProductRow>>(
            "Warehouse_Products",
            $"Company_ID=eq.{context.CompanyId}&Is_Deleted=eq.false&select=*",
            context.AccessToken,
            cancellationToken);
        var locations = await supabase.GetAsync<List<SupabaseLocationRow>>(
            "Warehouse_Locations",
            $"Company_ID=eq.{context.CompanyId}&Is_Deleted=eq.false&select=WHL_ID,WHL_Code,WHL_AreaID",
            context.AccessToken,
            cancellationToken);
        var areas = await supabase.GetAsync<List<SupabaseAreaRow>>(
            "Warehouse_Areas",
            $"Company_ID=eq.{context.CompanyId}&Is_Deleted=eq.false&select=WHA_ID,WHA_Name",
            context.AccessToken,
            cancellationToken);
        var stock = await supabase.GetAsync<List<SupabaseStockRow>>(
            "Warehouse_Stock",
            $"Company_ID=eq.{context.CompanyId}&Is_Deleted=eq.false&select=*&order=WHS_UI_ID.asc",
            context.AccessToken,
            cancellationToken);

        var productById = products.ToDictionary(product => product.Id);
        var locationById = locations.ToDictionary(location => location.Id);
        var areaById = areas.ToDictionary(area => area.Id);

        return stock
            .Where(row => productById.ContainsKey(row.ProductId))
            .GroupBy(row => row.ProductId)
            .Select(group =>
            {
                var product = productById[group.Key];
                var branchLocations = group.Select(row =>
                {
                    locationById.TryGetValue(row.LocationId ?? Guid.Empty, out var location);
                    var zone = location is not null && areaById.TryGetValue(location.AreaId ?? Guid.Empty, out var area) ? area.Name : string.Empty;
                    var available = row.OnHand - row.Allocated;

                    return new WarehouseStockBranchLocationDto(
                        row.UiId,
                        location?.Code ?? "Unassigned",
                        zone,
                        row.LotNumber ?? string.Empty,
                        NumberToInt(row.OnHand),
                        NumberToInt(row.Allocated),
                        NumberToInt(available),
                        row.FillPct,
                        row.NextMovement ?? "No movement",
                        row.Status,
                        row.Tone);
                }).ToList();

                var primary = branchLocations[0];
                var onHand = branchLocations.Sum(row => row.OnHand);
                var allocated = branchLocations.Sum(row => row.Allocated);
                var fill = branchLocations.Count == 0 ? 0 : (int)Math.Round(branchLocations.Average(row => row.Fill));

                return new WarehouseStockRowDto(
                    $"stk-{product.Sku.ToLowerInvariant().Replace('.', '-')}",
                    primary.Location,
                    primary.Zone,
                    product.Name,
                    product.Sku,
                    product.CustomerName,
                    primary.Lot,
                    onHand,
                    allocated,
                    onHand - allocated,
                    fill,
                    branchLocations.Count == 1 ? primary.NextMovement : "Multiple locations",
                    branchLocations.Any(row => row.Status == "Quarantine") ? "Quarantine" : primary.Status,
                    branchLocations.Any(row => row.Tone == "red") ? "red" : primary.Tone,
                    branchLocations);
            })
            .ToList();
    }

    private async Task<IReadOnlyList<WarehouseOrderDto>> GetOrdersAsync(WarehouseTenantContext context, CancellationToken cancellationToken)
    {
        var rows = await supabase.GetAsync<List<SupabaseOrderRow>>(
            "Warehouse_Orders",
            $"Company_ID=eq.{context.CompanyId}&Is_Deleted=eq.false&select=*&order=WHO_Ref.desc",
            context.AccessToken,
            cancellationToken);

        return rows.Select(row => new WarehouseOrderDto(
            row.Ref,
            row.CustomerName,
            row.Route ?? string.Empty,
            row.Type,
            row.Lines,
            row.Value ?? string.Empty,
            row.Due ?? string.Empty,
            row.Window ?? string.Empty,
            row.Status,
            row.Tone)).ToList();
    }

    private async Task<IReadOnlyList<WarehouseMovementDto>> GetMovementsAsync(WarehouseTenantContext context, CancellationToken cancellationToken)
    {
        var rows = await supabase.GetAsync<List<SupabaseMovementRow>>(
            "Warehouse_Movements",
            $"Company_ID=eq.{context.CompanyId}&Is_Deleted=eq.false&select=*&order=WHM_Ref.desc",
            context.AccessToken,
            cancellationToken);

        return rows.Select(row => new WarehouseMovementDto(
            row.Ref,
            row.Direction,
            row.ProductName,
            row.Reference ?? string.Empty,
            row.Quantity ?? string.Empty,
            row.Dock ?? string.Empty,
            row.Time ?? string.Empty,
            row.Status,
            row.Tone)).ToList();
    }

    private async Task<WarehouseWorkItemsDto> GetWorkItemsAsync(WarehouseTenantContext context, CancellationToken cancellationToken)
    {
        var rows = await supabase.GetAsync<List<SupabaseWorkItemRow>>(
            "Warehouse_Work_Items",
            $"Company_ID=eq.{context.CompanyId}&Is_Deleted=eq.false&select=*&order=WHWI_Board.asc,WHWI_ColumnID.asc,WHWI_SortOrder.asc",
            context.AccessToken,
            cancellationToken);

        static List<WarehouseKanbanColumnDto> MapBoard(IEnumerable<SupabaseWorkItemRow> items) => items
            .GroupBy(row => new { row.ColumnId, row.ColumnTitle, row.ColumnMeta })
            .Select(group => new WarehouseKanbanColumnDto(
                group.Key.ColumnId,
                group.Key.ColumnTitle,
                group.Key.ColumnMeta,
                group.Select(row => new WarehouseKanbanCardDto(row.CardId, row.Title, row.Meta, row.Status, row.Tone)).ToList()))
            .ToList();

        return new WarehouseWorkItemsDto(
            MapBoard(rows.Where(row => row.Board == "goods-in")),
            MapBoard(rows.Where(row => row.Board == "goods-out")));
    }

    private async Task<WarehouseCalendarDto> GetCalendarAsync(WarehouseTenantContext context, CancellationToken cancellationToken)
    {
        var rows = await supabase.GetAsync<List<SupabaseCalendarEventRow>>(
            "Warehouse_Calendar_Events",
            $"Company_ID=eq.{context.CompanyId}&Is_Deleted=eq.false&select=*&order=WHCE_Date.asc,WHCE_StartTime.asc",
            context.AccessToken,
            cancellationToken);

        var customers = rows
            .GroupBy(row => row.CustomerKey)
            .Select(group =>
            {
                var first = group.First();
                return new WarehouseCalendarCustomerDto(first.CustomerKey, first.CustomerName, first.CustomerShortName, first.CustomerColor);
            })
            .ToList();

        return new WarehouseCalendarDto(
            customers,
            rows.Select(row => new WarehouseCalendarEventDto(
                row.UiId,
                row.Date,
                row.StartTime,
                row.EndTime,
                row.Title,
                row.Type,
                row.CustomerKey,
                row.Tone)).ToList());
    }

    private static string ReadBearerToken(HttpContext httpContext)
    {
        var value = httpContext.Request.Headers.Authorization.ToString();
        return value.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) ? value["Bearer ".Length..].Trim() : string.Empty;
    }

    private static int NumberToInt(decimal value) => (int)Math.Round(value, MidpointRounding.AwayFromZero);

    private static string Escape(string value) => Uri.EscapeDataString(value);
}

internal sealed class SupabaseRestClient(HttpClient httpClient, SupabaseAuthOptions options)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public async Task<T> GetAsync<T>(string table, string query, string accessToken, CancellationToken cancellationToken)
    {
        using var request = CreateRequest(HttpMethod.Get, $"{table}?{query}", accessToken);
        using var response = await httpClient.SendAsync(request, cancellationToken);
        await EnsureSuccessAsync(response, cancellationToken);

        var result = await response.Content.ReadFromJsonAsync<T>(JsonOptions, cancellationToken);
        return result ?? throw new InvalidOperationException($"Supabase returned an empty response for {table}.");
    }

    public async Task PatchAsync(string table, string query, object body, string accessToken, CancellationToken cancellationToken)
    {
        using var request = CreateRequest(HttpMethod.Patch, $"{table}?{query}", accessToken);
        request.Headers.TryAddWithoutValidation("Prefer", "return=minimal");
        request.Content = JsonContent.Create(body, options: JsonOptions);

        using var response = await httpClient.SendAsync(request, cancellationToken);
        await EnsureSuccessAsync(response, cancellationToken);
    }

    private HttpRequestMessage CreateRequest(HttpMethod method, string pathAndQuery, string accessToken)
    {
        var request = new HttpRequestMessage(method, $"{options.Url}/rest/v1/{pathAndQuery}");
        request.Headers.TryAddWithoutValidation("apikey", options.ServiceRoleKey);
        request.Headers.TryAddWithoutValidation("Authorization", $"Bearer {accessToken}");
        request.Headers.TryAddWithoutValidation("Accept", "application/json");
        return request;
    }

    private static async Task EnsureSuccessAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        if (response.IsSuccessStatusCode) return;

        var detail = await response.Content.ReadAsStringAsync(cancellationToken);
        var statusCode = (int)response.StatusCode;
        throw new BadHttpRequestException(
            string.IsNullOrWhiteSpace(detail) ? response.ReasonPhrase ?? "Supabase request failed." : detail,
            statusCode);
    }
}

internal sealed record WarehouseOverviewDto(IReadOnlyList<WarehouseMetricDto> Metrics, IReadOnlyList<WarehouseHeaderActionDto> HeaderActions);
internal sealed record WarehouseMetricDto(string Label, string Value, string Detail, string Tone, string Icon);
internal sealed record WarehouseHeaderActionDto(string Label, string Value, string Icon, string Tone);
internal sealed record WarehouseProductDto(string Id, string Name, string Customer, string Category, string Sku, string HsCode, string SupplierRef, int OnHand, int Available, int Inbound, string Status, string Tone, string Owner);
internal sealed record WarehouseStockRowDto(string Id, string Location, string Zone, string Product, string ProductCode, string Customer, string Lot, int OnHand, int Allocated, int Available, int Fill, string NextMovement, string Status, string Tone, IReadOnlyList<WarehouseStockBranchLocationDto> BranchLocations);
internal sealed record WarehouseStockBranchLocationDto(string Id, string Location, string Zone, string Lot, int OnHand, int Allocated, int Available, int Fill, string NextMovement, string Status, string Tone);
internal sealed record WarehouseOrderDto(string Id, string Customer, string Route, string Type, int Lines, string Value, string Due, string Window, string Status, string Tone);
internal sealed record WarehouseMovementDto(string Id, string Direction, string Product, string Reference, string Quantity, string Dock, string Time, string Status, string Tone);
internal sealed record WarehouseWorkItemsDto(IReadOnlyList<WarehouseKanbanColumnDto> GoodsIn, IReadOnlyList<WarehouseKanbanColumnDto> GoodsOut);
internal sealed record WarehouseKanbanColumnDto(string Id, string Title, string? Meta, IReadOnlyList<WarehouseKanbanCardDto> Cards);
internal sealed record WarehouseKanbanCardDto(string Id, string Title, string Meta, string Status, string Tone);
internal sealed record WarehouseCalendarDto(IReadOnlyList<WarehouseCalendarCustomerDto> Customers, IReadOnlyList<WarehouseCalendarEventDto> Events);
internal sealed record WarehouseCalendarCustomerDto(string Id, string Name, string ShortName, string Color);
internal sealed record WarehouseCalendarEventDto(string Id, string Date, string Time, string EndTime, string Title, string Type, string CustomerId, string Tone);
internal sealed record WarehouseWorkItemReorderRequest(string Board, IReadOnlyList<WarehouseWorkItemReorderColumn> Columns);
internal sealed record WarehouseWorkItemReorderColumn(string Id, string Title, string? Meta, IReadOnlyList<WarehouseWorkItemReorderCard> Cards);
internal sealed record WarehouseWorkItemReorderCard(string Id);

internal sealed record WarehouseTenantContext(Guid CompanyId, string AccessToken);

internal sealed record SupabaseUserRow(
    [property: JsonPropertyName("User_ID")] Guid UserId,
    [property: JsonPropertyName("Company_ID")] Guid? CompanyId,
    [property: JsonPropertyName("User_Email")] string? Email);

internal sealed record SupabaseModuleRow([property: JsonPropertyName("Company_ID")] Guid CompanyId);

internal sealed record SupabaseProductRow(
    [property: JsonPropertyName("WHP_ID")] Guid Id,
    [property: JsonPropertyName("WHP_UI_ID")] string UiId,
    [property: JsonPropertyName("WHP_Name")] string Name,
    [property: JsonPropertyName("Customer_Name")] string CustomerName,
    [property: JsonPropertyName("WHP_Category")] string? Category,
    [property: JsonPropertyName("WHP_SKU")] string Sku,
    [property: JsonPropertyName("WHP_HSCode")] string? HsCode,
    [property: JsonPropertyName("WHP_SupplierRef")] string? SupplierRef,
    [property: JsonPropertyName("WHP_Owner")] string? Owner,
    [property: JsonPropertyName("WHP_Status")] string Status,
    [property: JsonPropertyName("WHP_Tone")] string Tone,
    [property: JsonPropertyName("WHP_InboundQty")] decimal InboundQty);

internal sealed record SupabaseStockRow(
    [property: JsonPropertyName("WHS_ID")] Guid Id,
    [property: JsonPropertyName("WHP_ID")] Guid ProductId,
    [property: JsonPropertyName("WHL_ID")] Guid? LocationId,
    [property: JsonPropertyName("WHS_UI_ID")] string UiId,
    [property: JsonPropertyName("WHS_LotNumber")] string? LotNumber,
    [property: JsonPropertyName("WHS_OnHand")] decimal OnHand,
    [property: JsonPropertyName("WHS_Allocated")] decimal Allocated,
    [property: JsonPropertyName("WHS_FillPct")] int FillPct,
    [property: JsonPropertyName("WHS_NextMovement")] string? NextMovement,
    [property: JsonPropertyName("WHS_Status")] string Status,
    [property: JsonPropertyName("WHS_Tone")] string Tone);

internal sealed record SupabaseLocationRow(
    [property: JsonPropertyName("WHL_ID")] Guid Id,
    [property: JsonPropertyName("WHL_Code")] string? Code,
    [property: JsonPropertyName("WHL_AreaID")] Guid? AreaId);

internal sealed record SupabaseAreaRow(
    [property: JsonPropertyName("WHA_ID")] Guid Id,
    [property: JsonPropertyName("WHA_Name")] string Name);

internal sealed record SupabaseOrderRow(
    [property: JsonPropertyName("WHO_Ref")] string Ref,
    [property: JsonPropertyName("WHO_CustomerName")] string CustomerName,
    [property: JsonPropertyName("WHO_Route")] string? Route,
    [property: JsonPropertyName("WHO_Type")] string Type,
    [property: JsonPropertyName("WHO_Lines")] int Lines,
    [property: JsonPropertyName("WHO_Value")] string? Value,
    [property: JsonPropertyName("WHO_Due")] string? Due,
    [property: JsonPropertyName("WHO_Window")] string? Window,
    [property: JsonPropertyName("WHO_Status")] string Status,
    [property: JsonPropertyName("WHO_Tone")] string Tone);

internal sealed record SupabaseMovementRow(
    [property: JsonPropertyName("WHM_Ref")] string Ref,
    [property: JsonPropertyName("WHM_Direction")] string Direction,
    [property: JsonPropertyName("WHM_ProductName")] string ProductName,
    [property: JsonPropertyName("WHM_Reference")] string? Reference,
    [property: JsonPropertyName("WHM_Quantity")] string? Quantity,
    [property: JsonPropertyName("WHM_Dock")] string? Dock,
    [property: JsonPropertyName("WHM_Time")] string? Time,
    [property: JsonPropertyName("WHM_Status")] string Status,
    [property: JsonPropertyName("WHM_Tone")] string Tone);

internal sealed record SupabaseWorkItemRow(
    [property: JsonPropertyName("WHWI_Board")] string Board,
    [property: JsonPropertyName("WHWI_ColumnID")] string ColumnId,
    [property: JsonPropertyName("WHWI_ColumnTitle")] string ColumnTitle,
    [property: JsonPropertyName("WHWI_ColumnMeta")] string? ColumnMeta,
    [property: JsonPropertyName("WHWI_CardID")] string CardId,
    [property: JsonPropertyName("WHWI_Title")] string Title,
    [property: JsonPropertyName("WHWI_Meta")] string Meta,
    [property: JsonPropertyName("WHWI_Status")] string Status,
    [property: JsonPropertyName("WHWI_Tone")] string Tone);

internal sealed record SupabaseCalendarEventRow(
    [property: JsonPropertyName("WHCE_UI_ID")] string UiId,
    [property: JsonPropertyName("WHCE_Date")] string Date,
    [property: JsonPropertyName("WHCE_StartTime")] string StartTime,
    [property: JsonPropertyName("WHCE_EndTime")] string EndTime,
    [property: JsonPropertyName("WHCE_Title")] string Title,
    [property: JsonPropertyName("WHCE_Type")] string Type,
    [property: JsonPropertyName("WHCE_CustomerKey")] string CustomerKey,
    [property: JsonPropertyName("WHCE_CustomerName")] string CustomerName,
    [property: JsonPropertyName("WHCE_CustomerShortName")] string CustomerShortName,
    [property: JsonPropertyName("WHCE_CustomerColor")] string CustomerColor,
    [property: JsonPropertyName("WHCE_Tone")] string Tone);
