using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysMdxrecordStatus
{
    public string MdxrecordStatusCode { get; set; } = null!;

    public string MdxrecordStatusName { get; set; } = null!;

    public string? MdxrecordStatusDescription { get; set; }

    public bool MdxrecordStatusIsFinal { get; set; }

    public int MdxrecordStatusSortOrder { get; set; }

    public bool MdxrecordStatusIsActive { get; set; }

    public DateTime MdxrecordStatusCreatedAt { get; set; }

    public virtual ICollection<MdxDataChangeEvent> MdxDataChangeEvents { get; set; } = new List<MdxDataChangeEvent>();

    public virtual ICollection<MdxSharedCargo> MdxSharedCargos { get; set; } = new List<MdxSharedCargo>();

    public virtual ICollection<MdxSharedCustom> MdxSharedCustoms { get; set; } = new List<MdxSharedCustom>();

    public virtual ICollection<MdxSharedDocument> MdxSharedDocuments { get; set; } = new List<MdxSharedDocument>();

    public virtual ICollection<MdxSharedEquipment> MdxSharedEquipments { get; set; } = new List<MdxSharedEquipment>();

    public virtual ICollection<MdxSharedJobVersion> MdxSharedJobVersions { get; set; } = new List<MdxSharedJobVersion>();

    public virtual ICollection<MdxSharedJob> MdxSharedJobs { get; set; } = new List<MdxSharedJob>();

    public virtual ICollection<MdxSharedMilestone> MdxSharedMilestones { get; set; } = new List<MdxSharedMilestone>();

    public virtual ICollection<MdxSharedParty> MdxSharedParties { get; set; } = new List<MdxSharedParty>();

    public virtual ICollection<MdxSharedRouteLeg> MdxSharedRouteLegs { get; set; } = new List<MdxSharedRouteLeg>();

    public virtual ICollection<MdxSharedTrackingEvent> MdxSharedTrackingEvents { get; set; } = new List<MdxSharedTrackingEvent>();
}
