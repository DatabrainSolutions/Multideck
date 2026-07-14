using FluentValidation;
using Multideck.Server.Modules.Warehouse.Facilities;
using Multideck.Server.Modules.Warehouse.Items;
using Multideck.Server.Modules.Warehouse.Inventory;
using Multideck.Server.Modules.Warehouse.Locations;
using Multideck.Server.Modules.Warehouse.Orders;

namespace Multideck.Server.Modules.Warehouse;

public static class WarehouseServiceCollectionExtensions
{
    public static IServiceCollection AddWarehouseModule(this IServiceCollection services)
    {
        services.AddScoped<IWarehouseContext, WarehouseContext>();
        services.AddScoped<IFacilityService, FacilityService>();
        services.AddScoped<IItemService, ItemService>();
        services.AddScoped<IItemImportWorkbook, ItemImportWorkbook>();
        services.AddScoped<ILocationService, LocationService>();
        services.AddScoped<IInventoryService, InventoryService>();
        services.AddScoped<IWarehouseOrderService, WarehouseOrderService>();

        services.AddValidatorsFromAssemblyContaining<CreateFacilityRequestValidator>(includeInternalTypes: true);

        return services;
    }
}
