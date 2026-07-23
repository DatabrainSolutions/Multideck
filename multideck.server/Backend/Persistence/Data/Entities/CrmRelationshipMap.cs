using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmRelationshipMap
{
    public Guid CrmrelMapId { get; set; }

    public Guid CrmrelMapAccountId { get; set; }

    public Guid? CrmrelMapFromContactId { get; set; }

    public Guid? CrmrelMapToContactId { get; set; }

    public Guid? CrmrelMapFromUserId { get; set; }

    public Guid? CrmrelMapToUserId { get; set; }

    public string CrmrelMapRelationshipType { get; set; } = null!;

    public decimal? CrmrelMapStrengthScore { get; set; }

    public string? CrmrelMapNotes { get; set; }

    public bool CrmrelMapIsActive { get; set; }

    public DateTime CrmrelMapCreatedAt { get; set; }

    public Guid? CrmrelMapCreatedBy { get; set; }

    public virtual CrmAccountProfile CrmrelMapAccount { get; set; } = null!;

    public virtual CmpUser? CrmrelMapCreatedByNavigation { get; set; }

    public virtual OrgContact? CrmrelMapFromContact { get; set; }

    public virtual CmpUser? CrmrelMapFromUser { get; set; }

    public virtual OrgContact? CrmrelMapToContact { get; set; }

    public virtual CmpUser? CrmrelMapToUser { get; set; }
}
