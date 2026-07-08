using FluentValidation;
using Multideck.Server.Modules.Warehouse.Facilities;
using Multideck.Server.Modules.Warehouse.Items;
using Multideck.Server.Modules.Warehouse.Locations;

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

        services.AddValidatorsFromAssemblyContaining<CreateFacilityRequestValidator>(includeInternalTypes: true);

        return services;
    }
}
