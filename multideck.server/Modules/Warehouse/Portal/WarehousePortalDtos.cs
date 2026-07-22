namespace Multideck.Server.Modules.Warehouse.Portal;

public sealed record WarehousePortalRoleOption(string Code, string Name, string Description);
public sealed record WarehousePortalFacilityOption(Guid Id, string Code, string Name);
public sealed record WarehousePortalReferenceResponse(
    IReadOnlyList<WarehousePortalRoleOption> Roles,
    IReadOnlyList<WarehousePortalFacilityOption> Facilities);

public sealed record InviteWarehouseCustomerRequest(
    Guid CustomerOrgId,
    string Email,
    string? DisplayName,
    string RoleCode,
    IReadOnlyList<Guid> FacilityIds);

public sealed record UpdateWarehouseCustomerAccessRequest(
    string RoleCode,
    IReadOnlyList<Guid> FacilityIds);

public sealed record WarehousePortalUserDto(
    Guid Id,
    string DisplayName,
    string Email,
    string Status,
    string RoleCode,
    IReadOnlyList<Guid> FacilityIds,
    DateTime? LastLoginAt);

public sealed record WarehousePortalInvitationResult(WarehousePortalUserDto User, bool Invited);
