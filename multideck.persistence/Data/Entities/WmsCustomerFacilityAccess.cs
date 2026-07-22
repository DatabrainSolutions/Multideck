namespace Multideck.Persistence.Entities;

/// <summary>
/// Explicit tenant boundary between a warehouse customer organisation and a facility.
/// This is deliberately separate from service contracts: commercial configuration must
/// never be the source of truth for data authorization.
/// </summary>
public sealed class WmsCustomerFacilityAccess
{
    public Guid WmscustomerFacilityAccessId { get; set; }
    public Guid WmscustomerFacilityAccessCustomerOrgId { get; set; }
    public Guid WmscustomerFacilityAccessFacilityId { get; set; }
    public bool WmscustomerFacilityAccessIsActive { get; set; }
    public DateTime WmscustomerFacilityAccessCreatedAt { get; set; }
    public Guid? WmscustomerFacilityAccessCreatedBy { get; set; }
    public DateTime WmscustomerFacilityAccessUpdatedAt { get; set; }

    public OrgMaster WmscustomerFacilityAccessCustomerOrg { get; set; } = null!;
    public WmsFacility WmscustomerFacilityAccessFacility { get; set; } = null!;
    public CmpUser? WmscustomerFacilityAccessCreatedByNavigation { get; set; }
}
