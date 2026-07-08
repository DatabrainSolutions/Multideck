using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmCustomerEngagementPreference
{
    public Guid CrmcustEngPrefId { get; set; }

    public Guid CrmcustEngPrefCustomerOrgId { get; set; }

    public string? CrmcustEngPrefPreferredChannelCode { get; set; }

    public Guid? CrmcustEngPrefPreferredContactId { get; set; }

    public bool CrmcustEngPrefAllowThankYouMessages { get; set; }

    public bool CrmcustEngPrefAllowFollowupMessages { get; set; }

    public bool CrmcustEngPrefAllowWhatsApp { get; set; }

    public bool CrmcustEngPrefDoNotOverContact { get; set; }

    public int CrmcustEngPrefMinHoursBetweenNonUrgentMessages { get; set; }

    public string? CrmcustEngPrefNotes { get; set; }

    public DateTime CrmcustEngPrefCreatedAt { get; set; }

    public DateTime CrmcustEngPrefUpdatedAt { get; set; }

    public virtual OrgMaster CrmcustEngPrefCustomerOrg { get; set; } = null!;

    public virtual SysCommChannel? CrmcustEngPrefPreferredChannelCodeNavigation { get; set; }

    public virtual OrgContact? CrmcustEngPrefPreferredContact { get; set; }
}
