using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsInboundAdvice
{
    public Guid WmsadviceId { get; set; }

    public Guid WmsadviceFacilityId { get; set; }

    public Guid? WmsadviceOrderId { get; set; }

    public Guid? WmsadviceJobId { get; set; }

    public Guid? WmsadviceEdimessageId { get; set; }

    public string WmsadviceAdviceNumber { get; set; } = null!;

    public string WmsadviceStatusCode { get; set; } = null!;

    public Guid WmsadviceCustomerOrgId { get; set; }

    public Guid? WmsadviceSupplierOrgId { get; set; }

    public Guid? WmsadviceCarrierOrgId { get; set; }

    public DateTime? WmsadviceExpectedArrivalAt { get; set; }

    public string? WmsadviceContainerNumber { get; set; }

    public string? WmsadviceSealNumber { get; set; }

    public string WmsadviceMetadataJson { get; set; } = null!;

    public DateTime WmsadviceCreatedAt { get; set; }

    public virtual ICollection<WmsInboundAdviceLine> WmsInboundAdviceLines { get; set; } = new List<WmsInboundAdviceLine>();

    public virtual ICollection<WmsReceipt> WmsReceipts { get; set; } = new List<WmsReceipt>();

    public virtual OrgMaster? WmsadviceCarrierOrg { get; set; }

    public virtual OrgMaster WmsadviceCustomerOrg { get; set; } = null!;

    public virtual EdiMessage? WmsadviceEdimessage { get; set; }

    public virtual WmsFacility WmsadviceFacility { get; set; } = null!;

    public virtual JobHeader? WmsadviceJob { get; set; }

    public virtual WmsOrder? WmsadviceOrder { get; set; }

    public virtual OrgMaster? WmsadviceSupplierOrg { get; set; }
}
